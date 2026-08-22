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

## What it says about each airport (run 2026-08-22)

Scores are computed **within each US Census region**, so the tables below are two separate
rankings, not one list. A 1.00 in New England and a 1.00 in the Pacific are not the same
thing — see [`docs/14-coverage-expansion.md`](14-coverage-expansion.md).

### New England (7 scored of 12 covered)

| airport | capacity pressure | forecast gap (pp) | unmet demand | expansion score |
|---|---|---|---|---|
| MHT Manchester | 0.34 | +6.81 | 1.00 | **0.62** |
| BGR Bangor | 0.54 | +0.17 | 0.04 | 0.43 |
| BTV Burlington | 0.35 | +1.71 | 0.26 | 0.37 |
| BOS Boston | 1.00 | −0.91 | 0.00 | 0.29 |
| PVD Providence | 0.24 | +1.17 | 0.12 | 0.21 |
| PWM Portland | 0.14 | −1.37 | 0.00 | 0.15 |
| BDL Hartford | 0.16 | +0.46 | 0.03 | 0.05 |

- **MHT (Manchester)** — the region's leading candidate, and the clearest illustration of
  why coverage matters: the FAA forecasts it growing **6.81 pp faster** than its own measured
  2014–2024 trend, on top of mid-range congestion. The 5-airport build could not see this
  airport at all.
- **BOS (Boston)** — the instructive case: the most congested airport in New England by a
  wide margin (1.00), yet its Unmet Demand Score is exactly **0**, because the FAA expects it
  to *slow down* relative to its historical trend. The model is saying "crowded, but not
  growth-driven — congestion here is not an expansion thesis."
- **PVD, BDL, PWM** — covered, real, and mid-to-low on every axis. Their presence is what
  makes the ranking a ranking.

### Pacific (31 scored), the original pilot airports within it

| airport | capacity pressure | forecast gap (pp) | unmet demand | expansion score |
|---|---|---|---|---|
| SFO | 0.85 | +2.07 | 1.00 | **0.89** |
| PDX | 0.35 | +2.34 | 0.47 | 0.54 |
| LAX | 0.45 | +1.15 | 0.30 | 0.37 |
| SNA | 0.47 | +0.12 | 0.03 | 0.21 |
| ANC | 0.13 | +0.52 | 0.04 | 0.16 |

- **SFO** — still first in its set against 30 peers, not 4: heavily congested *and* forecast
  to grow fastest. Both signals point the same way, which is the textbook case.
- **LAX** — moderately congested, moderate forecast growth. A reasonable case, less urgent.
- **SNA (Santa Ana)** — congestion close to LAX's, but almost no forecast growth gap, so it
  does not convert into an expansion thesis.
- **ANC (Anchorage)** — least congested of these five, moderate growth. No crowding to
  relieve.

## The takeaway

Within each region the leading candidate is the airport where both signals — current
congestion and forecast growth — point the same way at the same time: SFO in the Pacific,
MHT in New England. High congestion alone is not enough (BOS), and high growth alone is not
enough (a quiet airport growing fast is healthy, not strained).

This is an opportunity-screening result, not a profitability or payback forecast. With
regional comparison sets, one month of congestion evidence, and no project-cost or capacity
data anywhere public, confidence is low-to-moderate for prioritizing further diligence and
insufficient for an investment decision.
