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

## What it says about each airport (run 2026-08-22, twelve months of data)

Congestion is averaged over **June 2025 – May 2026**, a full annual cycle. Scores are
computed **within each US Census region**, so the tables below are two separate rankings,
not one list — see [`docs/14-coverage-expansion.md`](14-coverage-expansion.md).

### New England (7 scored of 12 covered)

| airport | capacity pressure | forecast gap (pp) | unmet demand | expansion score |
|---|---|---|---|---|
| BTV Burlington | 0.87 | +1.71 | 1.00 | **0.84** |
| BGR Bangor | 0.84 | +0.17 | 0.09 | 0.51 |
| BOS Boston | 0.66 | −0.91 | 0.00 | 0.23 |
| PWM Portland | 0.19 | −1.37 | 0.00 | 0.16 |
| PVD Providence | 0.08 | +1.17 | 0.07 | 0.15 |
| MHT Manchester | 0.01 | +6.81 | 0.07 | 0.09 |
| BDL Hartford | 0.11 | +0.46 | 0.04 | 0.04 |

- **BTV (Burlington)** — the region's leading candidate: sustained congestion across the
  year *and* a positive forecast gap. Read the de-icing caveat below before treating that
  congestion as structural.
- **BOS (Boston)** — the instructive case, and unchanged by a year of data: real congestion,
  but its Unmet Demand Score is exactly **0** because the FAA expects it to *slow down*
  relative to its own historical trend. Crowded, but not growth-driven.
- **MHT (Manchester)** — the same idea from the other side. It has by far the highest
  forecast growth gap in New England (+6.81 pp) and still ranks last, because it is the
  calmest airport in the region (0.01). Fast growth with no congestion is headroom, not
  unmet demand.
- **PVD, BDL, PWM** — covered, real, mid-to-low on every axis. Their presence is what makes
  the ranking a ranking.

### Pacific (31 scored), the original pilot airports within it

| airport | capacity pressure | forecast gap (pp) | unmet demand | expansion score |
|---|---|---|---|---|
| SFO | 0.84 | +2.07 | 1.00 | **0.89** |
| PDX | 0.50 | +2.34 | 0.67 | 0.66 |
| LAX | 0.64 | +1.15 | 0.42 | 0.47 |
| SNA | 0.46 | +0.12 | 0.02 | 0.20 |
| ANC | 0.20 | +0.52 | 0.05 | 0.16 |

- **SFO** — first in its set against 30 peers and a full year of data. Both signals point
  the same way at the same time, which is the textbook case.
- **LAX** — genuinely congested, moderate forecast growth. A reasonable case, less urgent.
- **SNA (Santa Ana)** — congestion in LAX's range, but almost no forecast growth gap, so it
  does not convert into an expansion thesis.
- **ANC (Anchorage)** — low congestion, moderate growth. Nothing to relieve.

**Why a full year matters, and the caveat it created:** a single-month run had ranked MHT
first and BTV third; twelve months reversed that (BTV's taxi-out spikes in winter, MHT stays
calm year-round) — one month can't tell congestion apart from a bad day. That winter
taxi-out, though, includes de-icing queues, not just runway/gate saturation — real delay and
cost, but weather rather than structural congestion, so a terminal doesn't fix it. Full
derivation in `docs/03-scoring-methodology.md` and `docs/14-coverage-expansion.md`.

## The takeaway

Within each region the leading candidate is the airport where both signals — current
congestion and forecast growth — point the same way at the same time: SFO in the Pacific,
BTV in New England. High congestion alone is not enough (BOS), and high growth alone is not
enough (a quiet airport growing fast is healthy, not strained).

This is an opportunity-screening result, not a profitability or payback forecast. With
regional comparison sets, one year of congestion evidence, an unseparated weather component
in that evidence, and no project-cost or capacity data anywhere public, confidence is low-to-moderate for prioritizing further diligence and
insufficient for an investment decision.
