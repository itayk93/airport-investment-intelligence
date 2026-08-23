# Stage 16 — Robustness Checks: Weight Sensitivity and De-icing

Two things were previously stated as caveats and left there: the scoring weights have no
empirical basis (docs/04, section 5, listed as an open item), and winter taxi-out at
northern airports includes de-icing queues that a terminal cannot fix (docs/03). A caveat
is not an answer to "so does your ranking actually depend on those?" — both are now
measured.

Both checks are **read-only**. They recompute rankings from the inputs already stored in
`airport_scores.inputs_json` and `airport_metrics_monthly`; neither writes to any table, so
running them cannot disturb the scores the app serves.

```bash
npm run sensitivity   # node scripts/sensitivity.mjs
npm run seasonality   # node scripts/seasonality.mjs
```

## 1. Weight sensitivity — `scripts/sensitivity.mjs`

Every region's ranking is rebuilt under eight alternate weightings and compared to the
shipped model by Spearman rank correlation, change of the top-ranked airport, and worst
single-airport rank shift. Run over 163 scored airports in 9 regions:

| Variant | Regions where #1 changed | Mean Spearman ρ | Worst rank shift |
|---|---|---|---|
| Equal congestion weights (⅓/⅓/⅓) | 0/9 | 0.992 | 5 |
| Taxi-out dominant (0.7/0.15/0.15) | 0/9 | 0.986 | 5 |
| NAS delay dominant | 4/9 | 0.969 | 7 |
| Delay frequency dominant | 3/9 | 0.938 | 15 |
| Equal expansion weights (⅓/⅓/⅓) | 1/9 | 0.967 | 5 |
| Unmet demand only (1/0/0) | 1/9 | 0.436 | 27 |
| Forecast growth only (0/1/0) | 8/9 | 0.770 | 21 |
| Congestion only (0/0/1) | 6/9 | 0.591 | 24 |

**Reading it.** Under any *plausible* reweighting — the top five rows, where all three
components still carry real weight — the ranking is stable: ρ ≥ 0.94 and the top airport
changes in at most 4 of 9 regions, none of them New England or Pacific. The three
degenerate rows are the interesting ones: collapsing the composite to a single term does
reorder everything (ρ 0.44–0.77). That is the correct result, and it is the argument for
the composite rather than against it — the three terms are measuring different things, so
any one of them alone gives a different and worse answer.

The two answers the demo actually gives survive all eight variants that keep more than one
term:

- **New England:** BTV first, BGR second under every non-degenerate weighting.
- **Pacific:** SFO first, PDX second under every non-degenerate weighting.

Under "forecast growth only", BGR (New England) and STS (Pacific) take first place — small
airports with high forecast CAGR and almost no congestion. That is exactly the failure the
pressure gate exists to prevent, now shown rather than asserted.

### Nominal weights are not effective weights

`ExpansionScore = 0.5·UnmetDemand + 0.3·norm(TAF CAGR) + 0.2·CapacityPressure`, and
`UnmetDemand = max(0, growth gap) × CapacityPressure`. Capacity pressure and forecast
growth therefore each enter the composite **twice** — once inside the unmet-demand term and
once on their own. The 0.2 on capacity pressure is its nominal weight, not its influence.

This is deliberate (docs/03, section 5: the un-gated terms exist so an early-stage
high-growth airport and an already-strained airport both surface), but it should be stated
as a design property rather than discovered by a reviewer reading the formula. The
"unmet demand only" and "congestion only" rows above bound how much the overlap can move a
ranking. The script prints the same note on every run.

## 2. De-icing — `scripts/seasonality.mjs`

The concern: BTV and BGR top New England's congestion ranking, and both are northern
airports whose winter taxi-out includes de-icing. If the ranking is really measuring
weather, it is not measuring an investment case.

The check rebuilds every region's ranking from the **eight non-winter months only**
(Dec–Mar excluded — a blunt calendar cut, chosen to bound the effect rather than to model
weather precisely), and compares.

**Result: the top-ranked airport changes in 0 of 9 regions.** New England stays
BTV (0.8407 → 0.8226), BGR, BOS. Pacific stays SFO (0.8863 → 0.8892), PDX, LAX.

Winter taxi-out premiums are real and largest where expected — TVC +3.83 min, SYR +3.31,
SBN +3.13, BTV +2.81, BGR +2.06 — but they are not what puts those airports at the top.
BTV ranks first in New England on non-winter months alone. The de-icing caveat remains
worth stating to a user reading a congestion figure; it is not a reason to discount the
ranking.

Airports whose rank *does* move by three or more places without winter (BIS, GRB, FWA, FAI,
ANC, RSW, FLL, SLC) are all mid-table, and the script lists them so a specific claim about
one of them can be qualified.

## What these checks do not establish

Stability under reweighting is not validity. Both scripts recompute from the same inputs, so
they test whether the *ranking* depends on arbitrary choices — not whether taxi-out and
forecast gap are the right proxies for investment opportunity in the first place. That
question needs project-cost and physical-capacity data the public sources do not publish,
and is out of scope for this build (docs/04, section 6).
