# Data Refresh Cadence and Automation

This document exists to answer one question directly, since it's likely to come up when
explaining the project: **how would this stay up to date, and how often?**

## Current state: two scheduled GitHub Actions workflows

The initial build ran `node scripts/ingest.mjs 2025` by hand. Refresh is now scheduled:

| Workflow | Schedule | What it does |
|---|---|---|
| `.github/workflows/refresh-daily.yml` | Daily, 06:00 UTC | Checks whether BTS has published a month we lack; if so ingests, re-scores, and commits the new aggregate |
| `.github/workflows/refresh-annual.yml` | 1 March, 06:00 UTC | Re-parses the FAA TAF vintage, ingests, re-scores |

Both also accept `workflow_dispatch` for a manual run. They share a `concurrency` group so
a daily and an annual run can never write to the database at the same time.

### Required one-time setup: repository secrets

**Neither workflow can run until these two secrets exist.** Without them the scripts throw
`Missing VITE_SUPABASE_URL or SUPABASE_SECRET_KEY` and the run fails.

In GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Add both:

| Secret | Value | Where it comes from |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` | Supabase dashboard → Project Settings → Data API |
| `SUPABASE_SECRET_KEY` | `sb_secret_...` | Supabase dashboard → Project Settings → API keys. **Secret key, not the publishable one** — ingestion writes, so the read-only key will not work |

Notes:

- These are **repository secrets**, not environment secrets — the workflows reference them
  as `secrets.NAME` with no `environment:` block.
- The secret key is a full-access service credential. It is read only inside the runner and
  passed to the scripts as env vars; it never reaches the browser bundle, which uses the
  publishable key only (see `docs/08-secrets-management.md`).
- `scripts/lib/env.mjs` reads `.env` but never overwrites an existing `process.env` value,
  so the same scripts work unchanged locally and in CI. There is no `.env` in the runner.
- Verify by running **Actions → Data refresh → Run workflow**. A successful run with
  no new BTS month ends with `No new BTS month published. Database unchanged.` in the summary —
  that is a pass, not a skip-because-broken.

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

New *data* therefore appears at most monthly. That is an argument for re-ingesting at most
monthly — it is not an argument for *checking* at most monthly, because the publication
date itself is unpredictable. The distinction matters and is the subject of the next
section: a check is one HTTP range request, while an ingest only happens when the check
finds something.

## Why daily, for a source that publishes monthly

BTS publishes on no fixed date. Any monthly schedule is therefore a guess about *when in
the month* they publish, and a wrong guess costs up to ~30 extra days of staleness on top
of the source's own 2-3 month lag. Checking daily removes the guess: worst-case staleness
drops from about a month to about a day.

It is nearly free. When nothing new is published the job is a checkout plus three HTTP
range probes — about 11 seconds — and this repository is public, so Actions minutes are
unmetered. The database is written only when a month actually arrives, and the commit step
is skipped entirely, so a quiet day leaves no trace beyond a green run.

The FAA TAF job stays annual: its source genuinely publishes once a year, its URL is pinned
to a vintage, and running it daily would download ~40 MB to re-upsert identical rows.

## How the daily workflow handles publication lag

BTS publishes on its own schedule, so the job cannot assume a specific month is ready.

1. It looks back **4, 3, and 2 months** and skips any month whose aggregate is already in
   `data/out/`. This means a missed or failed run self-heals: the next day picks up
   whatever is still absent, rather than needing a manual backfill.
2. For each missing month it runs `scripts/test-bts-ontime.mjs`, which probes with
   `Range: bytes=0-0` and reads `Content-Range` before downloading the ~31 MB ZIP. An
   unpublished month exits non-zero and is treated as a **skip, not a failure** — verified
   against the live source on 2026-08-22: `2026-6` returned 31,606,062 bytes and `2026-7`
   returned no range header.
3. **"Not published" and "published but broken" are distinguished.** The workflow matches
   the script's `not published yet` message explicitly; any *other* non-zero exit — a
   corrupt ZIP, a network fault, a parser bug — emits a `::error::` annotation and fails
   the job. Treating every failure as a skip would have made those cases green, and at a
   daily cadence that month would silently never ingest and never send an email. The three
   branches (skip / fail / success) are covered by a stubbed-runner test of the extracted
   step script.
4. If nothing new was published, the job ends without touching the database.
5. Otherwise: `ingest.mjs` → `score.mjs` → commit the new aggregate.

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
