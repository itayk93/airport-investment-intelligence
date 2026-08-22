# Stage 3 — Deterministic Scoring Methodology

This is the non-LLM logic the agent leans on. The LLM explains and compares; it does not
invent the numbers. All formulas below run against `airport_metrics_monthly` and
`airport_forecast_annual` (see `docs/02-database-schema.md`).

**Implemented in `scripts/score.mjs`** (run: `node scripts/score.mjs`), writing one row per
scored airport to `airport_scores`. Historical CAGR uses BTS T-100 2014→2024 (independently
measured actuals, not FAA's own historical estimate); forecast CAGR uses FAA TAF
2024→2035 — spans differ in length (10y vs 11y) because T-100 only goes back to 2014,
noted in the script, not hidden.

Verified output after the stage-14 coverage expansion — 163 airports scored across 10
regional comparison sets, run 2026-08-22. Two sets shown; `comparison_set_id` is the region.

`comparison_set_id='New England'` (7 scored, 12 covered):

| airport | capacity pressure | forecast growth gap (pp) | unmet demand score | expansion score |
|---|---|---|---|---|
| MHT | 0.34 | **+6.81** | **1.00** | **0.62** |
| BGR | 0.54 | +0.17 | 0.04 | 0.43 |
| BTV | 0.35 | +1.71 | 0.26 | 0.37 |
| BOS | **1.00** | −0.91 | 0.00 | 0.29 |
| PVD | 0.24 | +1.17 | 0.12 | 0.21 |
| PWM | 0.14 | −1.37 | 0.00 | 0.15 |
| BDL | 0.16 | +0.46 | 0.03 | 0.05 |

`comparison_set_id='Pacific'` (31 scored), the original pilot airports within it:

| airport | capacity pressure | forecast growth gap (pp) | unmet demand score | expansion score |
|---|---|---|---|---|
| SFO | 0.85 | **+2.07** | **1.00** | **0.89** |
| PDX | 0.35 | +2.34 | 0.47 | 0.54 |
| LAX | 0.45 | +1.15 | 0.30 | 0.37 |
| SNA | 0.47 | +0.12 | 0.03 | 0.21 |
| ANC | 0.13 | +0.52 | 0.04 | 0.16 |

SFO still ranks #1 in its set — matching the qualitative read from stage 1 (highest forecast
growth *and* worst current congestion among the original five) even though it is now measured
against 30 peers rather than 4. BOS shows a *negative* growth gap (FAA forecasts slower
growth than BTS's measured 2014-2024 actual trend), which correctly drives its Unmet Demand
Score to the floor (0) despite it now having the **highest** Capacity Pressure in New
England. Both are explicit invariants covered by regression tests, and both survived the
comparison-set change unchanged.

The substantive result of expanding coverage: New England's top candidate is MHT, an airport
the 5-airport build could not see at all, while BOS — the only New England airport it could
see — ranks fourth.

### Eligibility

An airport is covered but **not scored** when any of these holds, and the reason is reported
rather than silently dropped:

| Condition | Airports |
|---|---|
| Below 300 departures/month (sample floor) | 179 |
| No FAA TAF forecast for the facility | 3 |
| In a region with fewer than 3 scoreable airports | 2 |

Below the floor, one bad day moves `avg_taxi_out_minutes` and `nas_delay_min_per_dep` more
than genuine congestion does, so a score would be noise wearing a number's clothes. The floor
is ~10 departures/day, so one fully disrupted day is at most ~3% of a month's sample; it was
raised from 100 after a 134-departure airport ranked fourth in a 37-airport region on delay
averages a single bad week could produce (docs/14-coverage-expansion.md). Regions
with fewer than 3 scoreable airports are also left unranked: min-max over 1–2 members returns
0, 0.5 or 1 by arithmetic regardless of the inputs.

## Design constraint: two KPIs, not one KPI twice

Early risk flagged before writing this: "Capacity Pressure" and "Unmet Demand" could
easily collapse into the same number under two names. They are kept structurally
distinct — one is a *current-state* congestion measure, the other is a *forecast-vs-reality
gap*, and the second is explicitly gated by the first rather than computed independently.

## 1. Capacity Pressure Index (current state, no forecast involved)

Answers: "how strained is this airport's operation right now, relative to peers?"

Inputs, all from the currently ingested `airport_metrics_monthly` BTS On-Time months
(currently one month):

| Signal | Field | Why |
|---|---|---|
| Ground congestion | `avg_taxi_out_minutes` | Direct proxy for runway/taxiway saturation |
| System-caused delay | `nas_delay_min_per_dep` | Delay attributed to the air-traffic system itself (not weather/carrier) — the part actually tied to infrastructure/capacity, not one airline's ops |
| Delay frequency | `pct_delayed_over_15` | How often the airport misses its schedule at all |

Each signal is min-max normalized to [0,1] **across the comparison set** (the airport's US
Census region — see docs/14-coverage-expansion.md for why region and not nation) so the index is always relative, not an absolute scale:

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
UnmetDemandRaw(airport) = max(0, ForecastGrowthGapPct(airport)) × CapacityPressure(airport)
UnmetDemandScore(airport) = norm(UnmetDemandRaw across the comparison set)
```

This is the whole point of keeping them separate: multiplying means high forecast growth
with *low* current congestion scores low (healthy growth headroom, not "unmet"), and high
forecast growth with *high* current congestion scores high (real investment case — demand
is coming and the airport is already straining). If Capacity Pressure and Unmet Demand were
computed independently from the same inputs, they'd just be correlated restatements of each
other; gating growth-gap by pressure is what makes them two different questions. Clamping
negative growth gaps before normalization preserves the invariant that zero pressure or
non-positive forecast growth always produces zero unmet demand.

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
- Normalization is relative to the comparison set, not an absolute industry scale. Since
  stage 14 that set is the airport's **US Census region**, so scores are comparable within a
  region and **not** across regions. Adding or removing an airport shifts every score in its
  region only.
- The score screens opportunities. It does not estimate profitability, ROI, or payback;
  those require project-cost, revenue, financing, and physical-capacity inputs not present
  here. Confidence is low-to-moderate for screening, not sufficient for investment approval.
