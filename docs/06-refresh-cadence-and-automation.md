# Data Refresh Cadence and Automation

This document exists to answer one question directly, since it's likely to come up when
explaining the project: **how would this stay up to date, and how often?**

## Current state: manual, one-time, not automated

What actually ran: `node scripts/ingest.mjs 2025`, invoked by hand once, on 2026-08-22.
There is no cron job, no scheduled function, no trigger anywhere in this repo. That was
in scope for this assignment (prove the pipeline works end-to-end); a production refresh
schedule was not built. Anything below this line is a proposal, not a shipped feature —
stated plainly so it isn't mistaken for something already running.

## How often each upstream source actually publishes new data

| Source | Publish cadence | Typical lag observed |
|---|---|---|
| BTS T-100 (Socrata) | Monthly | ~2-3 months — as of 2026-08, data was available through 2026-04 |
| BTS On-Time Performance (TranStats ZIP) | One new ZIP per month | Similar lag — 2026-06 was the newest ZIP available; 2026-07 returned an error page (not yet published) |
| FAA TAF | Once a year ("Final" release) | The 2025 vintage covers historical actuals through FY2024 and forecasts through FY2055 |

This means: there's no value in polling BTS more than monthly, and no value in re-running
the FAA TAF ingestion more than once a year — the source itself doesn't change more
often than that. Polling faster than the source publishes would just re-fetch identical
data.

## Proposed automation (not implemented)

1. **Monthly scheduled job** (Supabase Cron / a GitHub Action / any scheduler) runs
   `scripts/ingest.mjs` on, say, the 5th of each month — giving BTS a few days of buffer
   after month-end before checking.
2. Before downloading the ~31 MB On-Time ZIP, probe with `Range: bytes=0-0` and read the
   `Content-Range` header (exactly what `scripts/test-bts-ontime.mjs` already does) — if
   the new month isn't published yet, skip and let the next scheduled run retry.
3. **FAA TAF ingestion runs once a year**, not monthly — separate, much lower-frequency
   schedule, or triggered manually when a new TAF vintage is noticed.
4. Every write already goes through `Prefer: resolution=merge-duplicates` (see
   `docs/05-ingestion-pipeline.md`), so re-running the same month's ingestion is
   idempotent — safe to schedule without building separate dedup logic.
5. `airport_scores` (the deterministic scoring output) would need its own re-compute step
   after each ingestion run, since it's materialized, not computed on read.

## What is documented vs. what would still need deciding

Documented now (this file): source cadence, lag, and the shape of a proposed schedule.
Not yet decided: which scheduler to actually use (Supabase Cron vs. an external
scheduler), alerting if a scheduled run fails, and how far back to re-ingest if a run is
missed for several months.
