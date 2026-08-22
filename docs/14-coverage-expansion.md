# Stage 14 — Coverage expansion: from 5 airports to every US origin

A decision record. It documents an argument that changed direction twice, what was measured
to settle it, what was built, and what is still not covered. The measurements are the point:
the first two positions taken here were both wrong, and only the numbers showed it.

## The question

Stages 1–13 shipped five airports: SFO, LAX, SNA, ANC, BOS. Should coverage grow, and to
what?

## Position 1 — expand modestly, to roughly 30 large airports

The argument for expanding at all was that one of the brief's four example questions —
*"Which airports in New England are strong candidates for terminal expansion?"* — had only
one covered airport in New England. The agent answered honestly that coverage was limited,
which satisfies the brief's *communicate scoping* requirement but does not answer the
question. A ranking over one candidate is not a ranking.

The argument for keeping it small was `ARCHITECTURE.md`'s stated tradeoff: five airports
deeply over fifty shallowly, with breadth traded for correctness.

## Position 2 — that misreads the question

Objection raised in review: the brief asks about a *region*, not about big airports. If the
question is "which airport in New England", then covering Boston and Hartford but not
Providence and Manchester does not produce a partial answer — it produces a wrong one, and
the wrongness is invisible, because the ranking looks complete either way. The conclusion is
determined by who was let into the list.

Regional completeness, not national top-N, is the requirement. That points at every airport
with real commercial service, which is roughly 400 — the number the previous position had
dismissed as arbitrary. It is not arbitrary: the FAA's own primary commercial service
definition (over 10,000 annual enplanements) is a published threshold, and everything below
it is general aviation with no terminal to invest in.

## What was measured before deciding

Three claims from the earlier positions were checked against the real sources rather than
estimated. Two of them were wrong.

| Claim | Measured | Verdict |
|---|---|---|
| Widening T-100 means one API request per airport | The Socrata endpoint aggregates server-side. All 1,311 US origins for 2025 is **one request, 10 s, 1.2 MB, 10,801 rows** | Wrong. Cost is flat, not linear |
| Widening On-Time means much more download | The 277 MB CSV is national already. A full pass over all 611,735 rows takes **11 s** | Wrong. Cost is unchanged |
| A national min-max comparison set flattens the scale | Confirmed by construction, and the fix is cheaper than expected — see below | Held |

A fourth number decided the actual scope, and was not anticipated by either position:

| Source | Airports |
|---|---|
| T-100, ≥10,000 annual passengers | 412 |
| BTS On-Time, all origins | **347** |
| BTS On-Time, ≥100 departures/month | 228 |
| BTS On-Time, ≥300 departures/month | **168** |

Congestion metrics are the input to Capacity Pressure, and they come only from On-Time. So
the ceiling is not 400 and not a matter of preference: **the data supports fewer than 200
scoreable airports**, and that limit is set by what BTS reporting carriers actually file.

## What was decided

1. **Coverage is every airport BTS reports departures from** — 347 — determined by the
   source, not by a list. `scripts/ingest.mjs` no longer contains an airport array.
2. **The comparison set is the airport's US Census region**, not one national set.
3. **Airports below 300 departures/month are covered but not scored**, with a stated reason.
4. **Regions with fewer than 3 scoreable airports are not ranked**, for the same reason.

### Why region, not nation

Min-max normalisation is relative by construction: the busiest and quietest members define
the endpoints and everyone else lands in between. Across a national set those endpoints are
extreme, so genuine differences between mid-sized airports compress toward zero and the
ranking stops discriminating.

Switching the comparison set to the region fixes this without changing the formula. It is
also the better answer independently of the arithmetic: "is Providence congested relative to
SFO" is not a question an investor asks, and SFO is not Providence's competitive peer. The
schema already carried `comparison_set_id` for exactly this, previously pinned to `pilot-5`.

The cost is a real constraint, stated rather than hidden: **scores from different regions
are not comparable.** BOS at 0.9962 Capacity Pressure in New England and SFO at 0.8457 in
the Pacific do not mean BOS is more congested than SFO — they mean each is near the top of a
different scale. Cross-region comparison must use the underlying metrics (taxi-out minutes,
NAS delay per departure, percent delayed), and both the agent prompt and the panel say so.

### Why a sample floor

A small airport with 40 departures in a month has delay averages that one bad afternoon can
dominate. Such an airport can outrank a genuinely congested hub on `avg_taxi_out_minutes`
while carrying no information. Reporting these as "covered but not ranked, and here is why"
is more useful than either a noisy score or a false "not covered".

**The first floor was set too low, and the data caught it.** 100 departures/month was chosen
by reasoning alone. With it in place, Redding (RDD) ranked **fourth out of 37** in the
Pacific set on 134 departures — with 8.31 NAS delay minutes per departure, more than double
Boston's 3.91 across 12,694 departures. That is not a congested airport; that is a small
sample with a bad month in it.

The floor was raised to **300 departures/month**, which is roughly 10 per day, so a single
fully disrupted day is at most ~3% of the sample rather than the ~10% a 100/month floor
allows. This drops national coverage from 228 scoreable airports to 168, and RDD and BLI
fall out of the Pacific ranking. New England is unaffected — its smallest scored airport,
Bangor, files 355. The floor is still a judgement call, but it is now a judgement call with
a stated rationale and a documented failure it was set to prevent.

## What was built

| Change | File |
|---|---|
| Extract all origins, capture city/state, flag sample sufficiency | `scripts/test-bts-ontime.mjs` |
| Drop the airport filter; one aggregated request, page-limit guard | `scripts/fetch-t100-monthly.mjs` |
| Parse all 3,319 TAF facilities from 2014; emit the FAA airport dimension | `scripts/parse-faa-taf-full.py` |
| Census-division region map | `scripts/lib/regions.mjs` |
| Build `airports` from the data; chunked upserts | `scripts/ingest.mjs` |
| Score per region; eligibility with reasons | `scripts/score.mjs` |
| Regional sets in reads; `scored` flag on the airport list | `supabase/functions/_shared/db.ts` |
| `region` filter on `list_airports`; per-row comparison sets | `supabase/functions/agent-chat/tools.ts` |
| Regional-scoring rules; coverage vs. scoreability | `supabase/functions/agent-chat/prompt.ts` |
| Region selector in the ranking panel | `src/components/panel/PanelBody.tsx` |

The `airports` table is no longer hand-maintained. It is assembled from BTS On-Time (origin
set, city, state), the FAA TAF `Airports.xlsx` (official facility name), and the Census
division of the state. This removes the one place where an author's list decided what the
agent could see.

## Measured result

Ingest, end to end, against the live project:

```
airports:                  347 rows
airport_metrics_monthly:   347 rows (On-Time) + 4,154 rows (T-100)
airport_forecast_annual: 14,154 rows
                          8.6 s total
```

Scoring: **163 airports scored across 9 regions, 3.7 s.**

Unscored, with reasons — the tally the script prints on every run:

```
184 unscored
  179  below the 300 departures/month sample floor
    3  no FAA TAF forecast for this facility
    2  only 2 scoreable airports in US Territories — too few for a relative ranking
```

US Territories is the rule from decision 4 firing on real data: PR and VI have two scoreable
origins between them, and a two-member min-max scale returns 0 and 1 by arithmetic. They stay
covered and are reported as unranked rather than being given scores that would look like a
ranking.

New England went from 1 covered airport to 12 covered and 7 scored:

| rank | airport | capacity pressure | growth gap (pp) | unmet demand | expansion score |
|---|---|---|---|---|---|
| 1 | MHT Manchester | 0.3378 | +6.805 | 1.0000 | **0.6235** |
| 2 | BGR Bangor | 0.5402 | +0.168 | 0.0395 | 0.4278 |
| 3 | BTV Burlington | 0.3530 | +1.712 | 0.2629 | 0.3706 |
| 4 | BOS Boston | 0.9962 | −0.906 | 0.0000 | 0.2939 |
| 5 | PVD Providence | 0.2419 | +1.173 | 0.1234 | 0.2146 |
| 6 | PWM Portland | 0.1404 | −1.372 | 0.0000 | 0.1482 |
| 7 | BDL Hartford | 0.1555 | +0.455 | 0.0308 | 0.0465 |

This is the substantive change: the region's top candidate is **MHT, an airport the previous
build could not see**, and Boston — the only airport it could see — ranks fourth. The earlier
answer was not merely narrow; under this model it was wrong.

Both documented scoring invariants survived the change, which is the regression check that
mattered most:

- **SFO still ranks first in its set** (Pacific, 31 airports, expansion score 0.8866).
- **BOS still has an Unmet Demand Score of exactly 0**, because its FAA forecast is slower
  than its measured T-100 trend, regardless of its now-highest-in-region congestion.

`tests/scoring.test.mjs` and the eight Deno tests pass unchanged.

## Verified live

Deployed and called through the public edge functions:

- `airport-data` returns 163 scores over 9 regional sets, 347 airports, 126 flagged
  unscored.
- **"Which airports in New England are strong candidates for terminal expansion?"** — the
  agent ranks MHT, BGR, BTV with the numbers above and states that scores are relative to
  New England.
- **"Compare LA and Santa Ana airport congestion levels."** — answered from underlying
  metrics rather than cross-region scores, as the revised prompt requires.

The remaining two brief questions (Anchorage long-haul share, SFO unmet demand) could not be
re-run live in this session: the agent's rate limiter returned `Too many requests. Try again
in an hour.` Their data paths were verified directly against the deployed `airport-data`
endpoint instead — SFO's Pacific-set score row and ANC's `long_haul_share_pct` of 29.73 are
both present and correct — but the end-to-end conversational answer for those two was not
re-observed after this change.

## What this does not fix

- **Still one month of congestion data** (2026-05). Wider coverage is not deeper history,
  and every seasonality caveat stands unchanged.
- **Still not a profitability model.** No project cost, no revenue, no gate or terminal
  capacity in any public source. This screens candidates; it does not rank returns.
- **Regional sets can be thin.** New England scores 7 airports. That is a real ranking, but
  a 7-member min-max scale is still more sensitive to its endpoints than a 37-member one.
- **US Territories is not a Census division.** PR/VI origins are grouped into their own set
  rather than being folded into a mainland region they have nothing to do with.
- **IATA/LOCID matching is assumed, not resolved.** TAF is keyed by FAA LOCID; where it
  differs from the IATA code the airport simply gets no forecast and is reported unscored,
  rather than being matched to the wrong facility. Six airports fall into this case.
