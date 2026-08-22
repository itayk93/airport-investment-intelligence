# Stage 14 — Coverage expansion: from 5 airports to every US origin

A decision record. It documents an argument that changed direction twice, what was measured
to settle it, what was built, and what is still not covered. The measurements are the point:
the first two positions taken here were both wrong, and only the numbers showed it.

## The question

Stages 1–13 shipped five airports: SFO, LAX, SNA, ANC, BOS. Should coverage grow, and to
what?

## Position 1 — expand modestly, to roughly 30 large airports

The argument for expanding at all: one of the brief's four example questions — *"Which
airports in New England are strong candidates for terminal expansion?"* — had only one
covered airport in New England. Answering honestly that coverage was limited satisfies the
brief's *communicate scoping* requirement but doesn't answer the question; a ranking over
one candidate isn't a ranking. The argument for keeping it small was `ARCHITECTURE.md`'s
stated tradeoff: five airports deeply over fifty shallowly.

## Position 2 — that misreads the question

Objection raised in review: the brief asks about a *region*, not about big airports.
Covering Boston and Hartford but not Providence and Manchester doesn't produce a partial
answer for New England — it produces a wrong one, invisibly, because the ranking looks
complete either way. The conclusion is determined by who was let into the list.

Regional completeness, not national top-N, is the requirement — every airport with real
commercial service, roughly 400, using the FAA's own published threshold (over 10,000 annual
enplanements; below it is general aviation with no terminal to invest in).

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
the endpoints. Across a national set those endpoints are extreme, so genuine differences
between mid-sized airports compress toward zero and the ranking stops discriminating.
Switching the comparison set to the region fixes this without changing the formula — and is
the better answer independently of the arithmetic: "is Providence congested relative to SFO"
isn't a question an investor asks. The schema already carried `comparison_set_id` for this,
previously pinned to `pilot-5`.

The tradeoff, stated rather than hidden: **scores from different regions are not
comparable.** BOS at 0.9962 Capacity Pressure in New England and SFO at 0.8457 in the
Pacific don't mean BOS is more congested — each is near the top of a different scale.
Cross-region comparison must use the underlying metrics (taxi-out, NAS delay, percent
delayed), and both the agent prompt and the panel say so.

### Why a sample floor

A small airport with 40 departures in a month has delay averages one bad afternoon can
dominate, letting it outrank a genuinely congested hub while carrying no information. The
first floor, 100 departures/month, was chosen by reasoning alone — and the data caught it:
Redding (RDD) ranked **fourth out of 37** in the Pacific set on 134 departures, with NAS
delay more than double Boston's across 100× the volume. That's a small sample with a bad
month in it, not a congested airport.

The floor was raised to **300 departures/month** (~10/day, so one fully disrupted day is
~3% of the sample instead of ~10%). This drops national coverage from 228 scoreable airports
to 168; New England is unaffected (its smallest scored airport, Bangor, files 355). Still a
judgement call, but now one with a stated rationale and a documented failure it prevents.

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

(Stage 15 backfilled a full year of congestion data; the current figures are 356 covered,
163 scored, 193 unscored. See the postscript.)

US Territories is the rule from decision 4 firing on real data: PR and VI have two scoreable
origins between them, and a two-member min-max scale returns 0 and 1 by arithmetic. They stay
covered and are reported as unranked rather than being given scores that would look like a
ranking.

New England went from 1 covered airport to 12 covered and 7 scored, with **MHT — an airport
the previous build couldn't see — as the new top candidate**, and Boston (the only airport
the old build could see) at #4. The earlier answer was not merely narrow; under this model
it was wrong. (This was the single-month result; stage 15's postscript below overturns the
specific ranking, though not the argument for expanding coverage.)

Both documented scoring invariants survived the change, which is the regression check that
mattered most:

- **SFO still ranks first in its set** (Pacific, 31 airports, expansion score 0.8866).
- **BOS still has an Unmet Demand Score of exactly 0**, because its FAA forecast is slower
  than its measured T-100 trend, regardless of its now-highest-in-region congestion.

`tests/scoring.test.mjs` and the eight Deno tests pass unchanged.

## Verified live

Deployed and called through the public edge functions:

- `airport-data` returns 163 scores over 9 regional sets and a covered count of 347;
  `list_airports` exposes the 126 unscored airports and their reasons to the agent.
- **"Which airports in New England are strong candidates for terminal expansion?"** — the
  agent ranks MHT, BGR, BTV with the numbers above and states that scores are relative to
  New England.
- **"Compare LA and Santa Ana airport congestion levels."** — answered from underlying
  metrics rather than cross-region scores, as the revised prompt requires.

The remaining two brief questions (Anchorage long-haul share, SFO unmet demand) hit the
agent's rate limiter in this session; their data paths were verified directly against the
deployed `airport-data` endpoint instead (SFO's Pacific-set score row and ANC's
`long_haul_share_pct` of 29.73 both present and correct), but not re-observed end to end.

## What this does not fix

- **Still not a profitability model.** No project cost, no revenue, no gate or terminal
  capacity in any public source. This screens candidates; it does not rank returns.
- **Regional sets can be thin.** New England scores 7 airports. That is a real ranking, but
  a 7-member min-max scale is still more sensitive to its endpoints than a 37-member one.
- **US Territories is not a Census division.** PR/VI origins are grouped into their own set
  rather than being folded into a mainland region they have nothing to do with.
- **IATA/LOCID matching is assumed, not resolved.** TAF is keyed by FAA LOCID; where it
  differs from the IATA code the airport simply gets no forecast and is reported unscored,
  rather than being matched to the wrong facility. Six airports fall into this case.


---

## Postscript — stage 15: a full year of congestion data overturned the headline

Stage 14 shipped on one month of BTS On-Time data (May 2026), documented as a limitation.
Stage 15 backfilled eleven more months to a complete annual cycle, **June 2025 – May 2026**
(11 downloads, ~11 s parsing each, ~25 min end to end; ingest of all twelve months: 10.5 s).

| | one month (May 2026) | twelve months |
|---|---|---|
| New England #1 | **MHT** 0.62 | **BTV** 0.84 |
| MHT | #1 | **#7, last** at 0.09 |
| BTV | #3 | #1 |
| BOS | #4 | #3 |

BTV's taxi-out runs 28–33 minutes November–February and under 18 in summer; MHT is the
calmest airport in the region most months, and May happened to be its worst relative
showing — one month couldn't tell congestion apart from a bad day, and stage 14's ranking
read the second as the first. The *argument* for expanding coverage still held completely;
the specific airport it surfaced did not.

MHT is now the better illustration of the model's core idea: highest forecast growth gap in
the region (+6.81 pp) but ranks last, because Capacity Pressure is 0.01 (calmest in the
region) — the Unmet Demand gate correctly reads that as headroom, not unmet demand. BOS
(congested, no growth) and MHT (growing, no congestion) now demonstrate the idea from both
directions, and neither is a candidate.

**New caveat the year created:** winter taxi-out includes de-icing queues, which is part of
why BTV and BGR lead New England on congestion. That's real delay and cost, but weather
rather than runway/gate saturation — a terminal doesn't fix it, and separating the two needs
a weather join this dataset doesn't have. The agent prompt raises this whenever a northern
airport ranks high on congestion.

### Current figures

```
356 airports covered · 163 scored · 9 regional comparison sets
193 unscored
  189  below the 300 departures/month sample floor (annual average)
    2  no FAA TAF forecast for this facility
    2  only 2 scoreable airports in US Territories
```

Both regression invariants survived the change, which is the check that mattered most:
**SFO still ranks first in the Pacific** (0.8863, against 30 peers and a full year), and
**BOS still floors at exactly 0 Unmet Demand.**
