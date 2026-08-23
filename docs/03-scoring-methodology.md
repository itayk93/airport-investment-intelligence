# Stage 3 — Deterministic Scoring Methodology

This is the non-LLM logic the agent leans on. The LLM explains and compares; it does not
invent the numbers. All formulas below run against `airport_metrics_monthly` and
`airport_forecast_annual` (see `docs/02-database-schema.md`).

**Implemented in `scripts/score.mjs`** (run: `node scripts/score.mjs`), writing one row per
scored airport to `airport_scores`. Historical CAGR uses BTS T-100 2014→2024 (independently
measured actuals, not FAA's own historical estimate); forecast CAGR uses FAA TAF
2024→2035 — spans differ in length (10y vs 11y) because T-100 only goes back to 2014,
noted in the script, not hidden.

Verified output over **twenty-four months of congestion data (July 2024 – June 2026)**, two
full annual cycles — 162 airports scored across 9 regional comparison sets, run 2026-08-22.
The score uses a trailing 24-month window rather than everything ingested, so every season is
counted exactly twice; see `docs/17-scoring-window-and-read-integrity.md`. Two sets shown;
`comparison_set_id` is the region.

`comparison_set_id='New England'` (7 scored, 12 covered):

| airport | capacity pressure | forecast growth gap (pp) | unmet demand score | expansion score |
|---|---|---|---|---|
| BTV | 0.72 | +1.71 | **1.00** | **0.81** |
| BGR | **0.77** | +0.17 | 0.11 | 0.51 |
| BOS | 0.72 | −0.91 | 0.00 | 0.24 |
| PVD | 0.10 | +1.17 | 0.10 | 0.17 |
| PWM | 0.19 | −1.37 | 0.00 | 0.16 |
| MHT | 0.02 | **+6.81** | 0.11 | 0.11 |
| BDL | 0.09 | +0.46 | 0.03 | 0.04 |

Note that BGR, not BTV, is the most congested New England airport over two years — BTV still
leads the ranking because it is the one whose forecast growth outruns its own measured trend.
That is the gating doing exactly what it is for, and it is more visible over two cycles than
it was over one.

`comparison_set_id='Pacific'` (31 scored), the original pilot airports within it:

| airport | capacity pressure | forecast growth gap (pp) | unmet demand score | expansion score |
|---|---|---|---|---|
| SFO | **0.85** | **+2.07** | **1.00** | **0.89** |
| PDX | 0.49 | +2.34 | 0.65 | 0.65 |
| LAX | 0.63 | +1.15 | 0.42 | 0.47 |
| ANC | 0.39 | +0.52 | 0.11 | 0.25 |
| SNA | 0.62 | +0.12 | 0.04 | 0.24 |

**SFO still ranks first in its set**, against 30 peers and two full years of data rather than
4 peers and one month — the strongest single piece of evidence that the model is measuring
something real. **BOS still floors at exactly 0 Unmet Demand**, because the FAA forecasts
it slower than its own measured T-100 trend, regardless of congestion. Both are regression
invariants and both survived every change to coverage, comparison set, and time span.

### What a full year changed, and why it matters

A single-month run (May 2026) had ranked MHT first in New England; a full year reverses that
to **BTV first, MHT near the bottom** — BTV's taxi-out spikes 28–33 min in winter and MHT
stays calm nearly year-round, which one month couldn't distinguish from a bad day. MHT itself
illustrates the model's core idea from the other side: highest forecast growth gap in the
region (+6.81 pp) and second-to-last score, because Capacity Pressure is 0.02 — fast growth at
an uncongested airport is headroom, not unmet demand. Full derivation in `docs/14`; the move
to a 24-month window is `docs/17`.

**Caveat:** winter taxi-out includes de-icing queues, not just runway/gate saturation, which
partly explains why BTV and BGR top New England's congestion ranking. That's real delay and
cost, but a terminal doesn't fix weather. The agent is instructed to raise this whenever a
northern airport ranks high on congestion. **Measured since:** rebuilding every ranking from
non-winter months only changes the top-ranked airport in 0 of 9 regions — BTV still leads
New England without December through March. De-icing inflates the congestion figure; it is
not what produces the ranking. See `docs/16-robustness-checks.md`.

### Eligibility

An airport is covered but **not scored** when any of these holds, and the reason is reported
rather than silently dropped:

| Condition | Airports |
|---|---|
| Below 300 departures/month averaged over the year | 189 |
| No FAA TAF forecast for the facility | 2 |
| In a region with fewer than 3 scoreable airports | 2 |

Below the floor, one bad day moves `avg_taxi_out_minutes` and `nas_delay_min_per_dep` more
than genuine congestion does, so a score would be noise wearing a number's clothes. The
floor is ~10 departures/day; it was raised from 100 after a 134-departure airport ranked
fourth in a 37-airport region (docs/14-coverage-expansion.md). Regions with fewer than 3
scoreable airports are also left unranked: min-max over 1–2 members returns 0, 0.5 or 1 by
arithmetic regardless of the inputs.

## Design constraint: two KPIs, not one KPI twice

Early risk flagged before writing this: "Capacity Pressure" and "Unmet Demand" could
easily collapse into the same number under two names. They are kept structurally
distinct — one is a *current-state* congestion measure, the other is a *forecast-vs-reality
gap*, and the second is explicitly gated by the first rather than computed independently.

## 1. Capacity Pressure Index (current state, no forecast involved)

Answers: "how strained is this airport's operation right now, relative to peers?"

Inputs, averaged across the twelve ingested `airport_metrics_monthly` BTS On-Time months
(June 2025 – May 2026):

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

Note the consequence: because `UnmetDemandScore` is itself `growth gap x capacity pressure`,
capacity pressure and forecast growth each enter this composite twice. The weights above are
nominal, not effective. `docs/16-robustness-checks.md` bounds how much that overlap can move
a ranking, and reports the full weight-sensitivity run — mean Spearman ρ ≥ 0.94 against the
shipped model under any reweighting that keeps all three components.

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
