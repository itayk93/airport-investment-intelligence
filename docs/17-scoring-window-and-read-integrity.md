# Stage 17 — A Two-Year Scoring Window, and Two Reads That Were Lying

Coverage went from 13 months of congestion data to **24 (July 2024 – June 2026)**, and the
score is now computed over an explicit trailing 24-month window. Backfilling turned up two
data-access bugs that had been quietly corrupting scores, both in the same read path.

## 1. Why the span mattered, and why 13 was the wrong number

Not because 13 is an odd number. Because **every congestion input is seasonal** — taxi-out,
NAS delay and delay frequency all move with winter weather and summer volume — and the span
ran June 2025 to June 2026, so **June was counted twice**. The model, the panel caveat and
the prompt all claimed "a full annual cycle means no season is double-counted", which had
been true at twelve months and quietly stopped being true when the refresh cron added one.

Two full cycles fix the balance and buy something the one-year version could not do: the
documented limitation "a year establishes a level, not a trend" softens, because the same
season can now be compared year over year — June 2025 against June 2026 — which is the only
honest way to measure change in a seasonal metric.

`SCORE_WINDOW_MONTHS = 24` in `scripts/score.mjs`, with two deliberate details:

- **The window is anchored on the latest period present in the data, not on today's date.**
  BTS publishes with a lag, so anchoring on the clock would silently shorten the window
  whenever a month ran late.
- **A short window warns rather than passing silently.** If fewer than 24 months are
  ingested, the run prints that scores are computed over an unbalanced span and will
  overweight the seasons it contains — the exact condition that went unnoticed at 13 months.

As the cron adds a month the oldest one leaves, so the window stays two cycles instead of
slowly acquiring a summer bias.

## 2. The read bugs

Both live in `scripts/lib/db.mjs`, the thin PostgREST client every ingestion and scoring
script reads through.

**PostgREST caps a response at 1,000 rows and says so only in a header.** The body is a
valid JSON array of the first 1,000 rows, so a caller that just reads the body gets a
silently partial answer. `getChunked` chunks by 80 airports, which was fine when each
airport had one row — but with 13 months that is 1,040 rows, and with 24 months 1,920. A
chunk therefore returned complete data for the first ~46 airports and **nothing at all for
the remaining ~34**, which looks exactly like sparse coverage rather than like a bug. Some
airports were excluded from scoring with the reason "no BTS On-Time month ingested" when the
months were in fact sitting in the table.

`get()` now pages until a short page comes back.

**Then paging exposed the second bug: a paged query with no `order` is not just untidy, it
is wrong.** PostgREST passes the range to Postgres, which is free to return rows in a
different order for each request, so page 2 can repeat rows from page 1 and omit others.
The first 24-month scoring run produced airports with **11 of 24 months** and averaged
capacity pressure over whichever months happened to survive — BTV came out at 0.90 capacity
pressure instead of 0.72. `get()` now refuses to page a query that has no `order=` clause,
and every read that can exceed a page sorts explicitly.

### How much this had corrupted the shipped scores

Measured before fixing anything, by recomputing the 13-month scores with correct reads and
comparing against what was actually stored:

| | |
|---|---|
| Regions whose top-ranked airport was wrong | **1 of 9** (East North Central: stored CAK, correct FNT) |
| Largest expansion-score error | 0.067 |
| New England and Pacific | unaffected — BTV and SFO led either way |

So the demo answers were never wrong, and one mid-size region's leader was. That is the
honest summary: a silent truncation that a spot check of the headline numbers would never
have caught, which is the argument for checking the read layer rather than the outputs.

## 3. What changed in the scores

| | 13-month window | 24-month window |
|---|---|---|
| Scored airports | 163 | 162 (one falls below the sample floor over two years) |
| Regions whose leader changed | — | 2 of 9 (Mountain, East North Central) |
| Worst single-airport rank shift | — | 4 |
| Largest expansion-score change | — | 0.112 |
| New England | BTV, BGR, BOS | **BTV, BGR, BOS** |
| Pacific | SFO, PDX, LAX | **SFO, PDX, LAX** |

Both headline answers survive doubling the data, which is the useful result. The visible
change is in the components rather than the ranking: BTV's capacity pressure falls from 0.86
to 0.72 and **BGR overtakes it as New England's most congested airport** (0.77), while BTV
keeps the top expansion score on the strength of its forecast gap. One winter no longer
carries the whole congestion picture.

All three robustness checks (`docs/16`) were re-run on the new window and their numbers in
that document are from the 24-month scores.
