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

## What it says about each airport (run 2026-08-22, pilot-5 set)

| airport | capacity pressure | forecast gap (pp) | unmet demand | expansion score |
|---|---|---|---|---|
| SFO | 1.00 | +2.07 | 1.00 | **1.00** |
| LAX | 0.46 | +1.15 | 0.42 | 0.38 |
| BOS | 0.63 | −0.91 | 0.00 | 0.26 |
| SNA | 0.52 | +0.12 | 0.24 | 0.22 |
| ANC | 0.00 | +0.52 | 0.22 | 0.15 |

- **SFO (1.00 across the board)** — the most congested airport in the set, and also
  expected to grow the most. This is the textbook "invest here" case: both future demand
  and current strain point the same direction.
- **LAX** — moderately congested, moderate-to-high forecast growth. A reasonable
  investment case, but less urgent than SFO.
- **BOS** — the interesting one: the FAA actually expects it to **slow down**
  (gap = −0.91) relative to its own historical trend. So even though it's not the calmest
  airport (0.63 pressure), there's no "unmet" demand to address — Unmet Demand comes out
  at exactly **0**. The model is saying: "no growth-driven urgency to invest here."
- **SNA (Santa Ana)** — less congested than LAX/SFO, low forecast growth. Not a strong
  candidate.
- **ANC (Anchorage)** — the least congested of all (exactly 0), even with moderate
  forecast growth. Simply no crowding here that would justify urgency.

## The takeaway

SFO is the leading expansion candidate — not just because it's the biggest airport, but
because it's the only one where both signals (current congestion + forecast growth)
point the same way at the same time.
