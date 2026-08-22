# Stage 3 — Deterministic Scoring Methodology

This is the non-LLM logic the agent leans on. The LLM explains and compares; it does not
invent the numbers. All formulas below run against `airport_metrics_monthly` and
`airport_forecast_annual` (see `docs/02-database-schema.md`).

**Implemented in `scripts/score.mjs`** (run: `node scripts/score.mjs`), writing one row
per airport to `airport_scores`. Historical CAGR uses BTS T-100 2014→2024 (independently
measured actuals, not FAA's own historical estimate); forecast CAGR uses FAA TAF
2024→2035 — spans differ in length (10y vs 11y) because T-100 only goes back to 2014,
noted in the script, not hidden.

Verified output, `comparison_set_id='pilot-5'`, run 2026-08-22:

| airport | capacity pressure | forecast growth gap (pp) | unmet demand score | expansion score |
|---|---|---|---|---|
| SFO | **1.00** | **+2.07** | **1.00** | **1.00** |
| LAX | 0.46 | +1.15 | 0.42 | 0.38 |
| BOS | 0.63 | −0.91 | 0.00 | 0.26 |
| SNA | 0.52 | +0.12 | 0.24 | 0.22 |
| ANC | 0.00 | +0.52 | 0.22 | 0.15 |

SFO ranks #1 on every axis — matches the qualitative read from stage 1 (highest forecast
growth *and* worst current congestion of the five). BOS shows a *negative* growth gap
(FAA forecasts slower growth than BTS's measured 2014-2024 actual trend), which correctly
drives its Unmet Demand Score to the floor (0) regardless of its mid-range congestion —
exactly the gating behavior section 3 was designed to produce.

## Design constraint: two KPIs, not one KPI twice

Early risk flagged before writing this: "Capacity Pressure" and "Unmet Demand" could
easily collapse into the same number under two names. They are kept structurally
distinct — one is a *current-state* congestion measure, the other is a *forecast-vs-reality
gap*, and the second is explicitly gated by the first rather than computed independently.

## 1. Capacity Pressure Index (current state, no forecast involved)

Answers: "how strained is this airport's operation right now, relative to peers?"

Inputs, all from `airport_metrics_monthly` (BTS On-Time), trailing 12 months:

| Signal | Field | Why |
|---|---|---|
| Ground congestion | `avg_taxi_out_minutes` | Direct proxy for runway/taxiway saturation |
| System-caused delay | `nas_delay_min_per_dep` | Delay attributed to the air-traffic system itself (not weather/carrier) — the part actually tied to infrastructure/capacity, not one airline's ops |
| Delay frequency | `pct_delayed_over_15` | How often the airport misses its schedule at all |

Each signal is min-max normalized to [0,1] **across the comparison set** (the pilot 5,
or whatever set is being ranked) so the index is always relative, not an absolute scale:

```
norm(x, set) = (x - min(set)) / (max(set) - min(set))

CapacityPressure(airport) =
    0.4 * norm(avg_taxi_out_minutes)
  + 0.35 * norm(nas_delay_min_per_dep)
  + 0.25 * norm(pct_delayed_over_15)
```

Weights are a judgment call (taxi-out weighted highest — it's the most direct physical
congestion signal with the least noise from weather/carrier-specific delay), stated as
such, and kept as named constants so they're trivially adjustable, not buried in code.

Output range: 0 (least pressured airport in the set) to 1 (most pressured). This is a
**relative ranking tool**, not an absolute severity scale — it does not claim SFO's 1.0
means "at capacity," only "most pressured among the compared airports."

## 2. Forecast Growth Gap (forecast vs. historical reality, no congestion involved)

Answers: "is demand at this airport expected to outrun what it has actually delivered?"

```
ForecastGrowthGapPct(airport) =
    TAF_forecast_enplanement_CAGR(base_year → horizon_year)
  - T100_historical_enplanement_CAGR(same span, most recent comparable years)
```

Positive gap = FAA expects faster growth than the airport's own recent trend has shown.
This alone says nothing about whether that's a problem — an airport with spare capacity
absorbing high forecast growth is a good investment case, not unmet demand.

## 3. Unmet Demand Score (the two combined, deliberately not independent)

```
UnmetDemandScore(airport) = ForecastGrowthGapPct(airport) × CapacityPressure(airport)
```

This is the whole point of keeping them separate: multiplying means high forecast growth
with *low* current congestion scores low (healthy growth headroom, not "unmet"), and high
forecast growth with *high* current congestion scores high (real investment case — demand
is coming and the airport is already straining). If Capacity Pressure and Unmet Demand were
computed independently from the same inputs, they'd just be correlated restatements of each
other; gating growth-gap by pressure is what makes them two different questions.

## 4. Long-Haul Share (ANC-style questions)

```
LongHaulSharePct(airport) = long_haul_departures / total_departures * 100
  where long_haul := distance_miles >= LONG_HAUL_THRESHOLD_MILES  (default 2000, configurable)
```

Computed per-scope: domestic-only from On-Time, cross-checked against T-100's
domestic/international departure split for the international leg the On-Time source
cannot see (see stage 1 doc, gap #1).

## 5. Terminal Expansion Candidate Score (New England-style ranking questions)

Composite ranking for "which airports are strong candidates for expansion":

```
ExpansionScore(airport) =
    0.5 * UnmetDemandScore(airport)
  + 0.3 * norm(TAF_forecast_enplanement_CAGR)
  + 0.2 * CapacityPressure(airport)
```

Unmet Demand is weighted highest since it already encodes both growth and current strain;
the other two terms are included un-gated so a high-growth-but-not-yet-strained airport
(early expansion opportunity) and a currently-strained-regardless-of-forecast airport
(urgent bottleneck) both surface, not just airports that are already both.

## What stays explicitly out of scope

- No capacity/runway/gate-count dataset exists publicly at the granularity needed — every
  formula above only uses delay, taxi-out, and enplanement/forecast data. This is stated
  to the user by the agent whenever "unmet demand" or "capacity pressure" is discussed.
- Weights (0.4/0.35/0.25, 0.5/0.3/0.2, the 2000-mile long-haul cutoff) are declared
  assumptions, kept as named constants in the scoring module, not hidden in prose.
- Normalization is relative to the comparison set, not an absolute industry scale — scores
  will shift if the comparison set changes (e.g., 5 pilot airports vs. all US airports).
