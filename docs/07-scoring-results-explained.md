# Scoring Results — Explained in Plain Language

Companion to `docs/03-scoring-methodology.md` (the formulas) — this is the same result,
explained the way it would be explained to a non-technical stakeholder.

## What each number means

- **Capacity Pressure** — "how congested is this airport right now, relative to the
  other airports we looked at?" 1.00 = most congested of the set. 0 = least congested.
- **Forecast Growth Gap** — "how much faster does the FAA expect this airport to grow
  than it actually has been growing?" Positive = forecast growth outpaces the historical
  trend. Negative = the FAA actually expects a **slowdown** relative to what's already
  happened.
- **Unmet Demand** — "is there a real problem here?" Not just forecast growth on its own,
  but growth **combined with** already-high congestion. An airport expected to grow but
  not congested = not a problem. An airport expected to grow **and** already congested =
  yes, a real problem.
- **Expansion Score** — the final number, a weighted blend of everything above — "how
  strong a candidate is this airport for expansion investment?"

## What it says about each airport (run 2026-08-23, twenty-four months of data)

Congestion is averaged over **July 2024 – June 2026**, two full annual cycles — a trailing
24-month window, so every season counts exactly twice. Scores are
computed **within each US Census region**, so the tables below are two separate rankings,
not one list — see [`docs/14-coverage-expansion.md`](14-coverage-expansion.md).

### New England (7 scored of 12 covered)

| airport | capacity pressure | forecast gap (pp) | unmet demand | expansion score |
|---|---|---|---|---|
| BTV Burlington | 0.72 | +1.71 | 1.00 | **0.81** |
| BGR Bangor | 0.77 | +0.17 | 0.11 | 0.51 |
| BOS Boston | 0.72 | −0.91 | 0.00 | 0.24 |
| PVD Providence | 0.10 | +1.17 | 0.10 | 0.17 |
| PWM Portland | 0.19 | −1.37 | 0.00 | 0.16 |
| MHT Manchester | 0.02 | +6.81 | 0.11 | 0.11 |
| BDL Hartford | 0.09 | +0.46 | 0.03 | 0.04 |

- **BTV (Burlington)** — the region's leading candidate, and the clearest illustration of
  what the model is actually measuring: it is **not** the most congested airport in New
  England. Bangor is (0.77 against BTV's 0.72). BTV leads because it is the one whose
  forecast growth outruns its own measured trend while it is already under pressure. The
  most congested airport and the strongest expansion candidate are different airports, which
  is the entire point of gating growth by congestion rather than adding the two.
- **BOS (Boston)** — the instructive case, and unchanged by a year of data: real congestion,
  but its Unmet Demand Score is exactly **0** because the FAA expects it to *slow down*
  relative to its own historical trend. Crowded, but not growth-driven.
- **MHT (Manchester)** — the same idea from the other side. It has by far the highest
  forecast growth gap in New England (+6.81 pp) and still ranks second-to-last, because it is
  the calmest airport in the region (0.02). Fast growth with no congestion is headroom, not
  unmet demand.
- **PVD, BDL, PWM** — covered, real, mid-to-low on every axis. Their presence is what makes
  the ranking a ranking.

### Pacific (31 scored), the original pilot airports within it

| airport | capacity pressure | forecast gap (pp) | unmet demand | expansion score |
|---|---|---|---|---|
| SFO | 0.85 | +2.07 | 1.00 | **0.89** |
| PDX | 0.49 | +2.34 | 0.65 | 0.65 |
| LAX | 0.63 | +1.15 | 0.42 | 0.47 |
| ANC | 0.39 | +0.52 | 0.11 | 0.25 |
| SNA | 0.62 | +0.12 | 0.04 | 0.24 |

- **SFO** — first in its set against 30 peers and two full years of data. Both signals point
  the same way at the same time, which is the textbook case.
- **LAX** — genuinely congested, moderate forecast growth. A reasonable case, less urgent.
- **SNA (Santa Ana)** — congestion in LAX's range (0.62 against 0.63), but almost no
  forecast growth gap, so it does not convert into an expansion thesis. The pair is the
  cleanest demonstration in the data that congestion alone does not make a case.
- **ANC (Anchorage)** — moderate congestion, moderate growth. Nothing acute to relieve.

**Why the span matters, and the caveat it created:** a single-month run had ranked MHT
first and BTV third; a full year reversed that (BTV's taxi-out spikes in winter, MHT stays
calm year-round) — one month can't tell congestion apart from a bad day. That winter
taxi-out, though, includes de-icing queues, not just runway/gate saturation — real delay and
cost, but weather rather than structural congestion, so a terminal doesn't fix it. Two
cycles have since made that caveat measurable rather than merely stated: rebuilding the
rankings without December–March changes no region's leader (`docs/16`). Full derivation in
`docs/03-scoring-methodology.md`, `docs/14-coverage-expansion.md` and `docs/17`.

## The takeaway

Within each region the leading candidate is the airport where both signals — current
congestion and forecast growth — point the same way at the same time: SFO in the Pacific,
BTV in New England. High congestion alone is not enough (BOS), and high growth alone is not
enough (a quiet airport growing fast is healthy, not strained).

This is an opportunity-screening result, not a profitability or payback forecast. With
regional comparison sets, two years of congestion evidence, an unseparated weather component
in that evidence, and no project-cost or capacity data anywhere public, confidence is low-to-moderate for prioritizing further diligence and
insufficient for an investment decision.
