# Data Refresh Cadence and Automation

This document exists to answer one question directly, since it's likely to come up when
explaining the project: **how would this stay up to date, and how often?**

## Current state: two scheduled GitHub Actions workflows

The initial build ran `node scripts/ingest.mjs 2025` by hand. Refresh is now scheduled:

| Workflow | Schedule | What it does |
|---|---|---|
| `.github/workflows/refresh-monthly.yml` | 5th of each month, 06:00 UTC | Fetches any newly published BTS On-Time month, ingests, re-scores, commits the new aggregate |
| `.github/workflows/refresh-annual.yml` | 1 March, 06:00 UTC | Re-parses the FAA TAF vintage, ingests, re-scores |

Both also accept `workflow_dispatch` for a manual run. They share a `concurrency` group so
a monthly and an annual run can never write to the database at the same time.

**Setup required once:** repository secrets `VITE_SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
The service key is used only inside the runner; nothing scheduled touches the browser bundle.

### Why GitHub Actions and not Supabase Cron

This was the obvious first choice — the database is already Supabase — and it does not work.
Supabase Edge Functions cap **CPU time at 2 seconds per request**. Measured stages of this
pipeline:

| Stage | CPU | Under 2s? |
|---|---|---|
| Streaming the 277 MB On-Time CSV | ~11 s | no |
| `ingest.mjs` | ~8.6 s | no |
| `score.mjs` | ~3.7 s | no |

`scripts/test-bts-ontime.mjs` also shells out to `unzip` and streams from local disk;
neither subprocesses nor a writable working directory exist in the edge runtime.

There is one genuine Supabase-native option: `pg_cron` running the scoring as pure SQL
inside Postgres, since min-max normalisation grouped by region is window functions and has
no CPU cap. It was rejected because it would put the scoring formula in **two** places —
`scripts/lib/scoring.mjs` and SQL — which breaks the single-definition property the rest of
the system is built on (`_shared/db.ts` is the one definition of every read). It would also
only cover one of the four stages; the download and parse still need a Node runtime.

A full runner runs the existing scripts unmodified, with no rewrite and no second copy of
the scoring logic. The deciding factor is that the work is heavy and disk-local, not where
the database lives.

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

## How the monthly workflow handles publication lag

BTS publishes on its own schedule, so the job cannot assume a specific month is ready.

1. It looks back **4, 3, and 2 months** and skips any month whose aggregate is already in
   `data/out/`. This means a missed or failed run self-heals: the next month picks up
   whatever is still absent, rather than needing a manual backfill.
2. For each missing month it runs `scripts/test-bts-ontime.mjs`, which probes with
   `Range: bytes=0-0` and reads `Content-Range` before downloading the ~31 MB ZIP. An
   unpublished month exits non-zero and is treated as a **skip, not a failure** — verified
   against the live source on 2026-08-22: `2026-6` returned 31,606,062 bytes and `2026-7`
   returned no range header.
3. If nothing new was published, the job ends without touching the database.
4. Otherwise: `ingest.mjs` → `score.mjs` → commit the new aggregate.

Idempotence is inherited, not rebuilt: every write goes through
`Prefer: resolution=merge-duplicates` (see `docs/05-ingestion-pipeline.md`), so re-running
a month is safe. `airport_scores` is materialized rather than computed on read, so
`score.mjs` runs after every ingestion; it inserts the new run and then deletes rows older
than the run's start timestamp, so a crash mid-write leaves the previous scores intact.

**Why the monthly aggregates are committed back.** The ~240 KB `data/out/ontime-*.json`
files are tracked in git; the 31 MB ZIP and 277 MB CSV are deleted by the fetch script and
never committed. Keeping the aggregates in the repo is what makes `node scripts/ingest.mjs`
reproducible from a clean checkout — without them, a fresh run would rebuild coverage from
a single month.

## What still needs deciding

- **Alerting** is GitHub's default failed-run email. Adequate for a prototype, not a
  production on-call path.
- **The FAA TAF URL is pinned to a vintage** (`APO100_TAF_Final_2025.zip`). A new vintage
  needs that constant updated by hand; the annual job failing is the intended reminder.
- **Deep backfills** (more than four months missed) are still a manual
  `node scripts/test-bts-ontime.mjs YEAR MONTH` per month.
