# Stage 4 — Ingestion Pipeline

`scripts/ingest.mjs` — loads the sources verified in stage 1 into the schema designed
in stage 2, on the Supabase project set up earlier. Run: `node scripts/ingest.mjs [year]`
(`year` defaults to 2025, controls which T-100 year gets pulled).

## Why this isn't a straight replay of `data/out/*.json`

The task was "ingest from `data/out/*.json`," and mostly that's what happens — but two of
the three stage-1 output files are at the wrong **grain** for the schema, so the script
diverges from a blind file-replay in two places. Both are called out in code comments,
not hidden:

1. **T-100**: `data/out/t100-2025.json` is an annual roll-up (built for the stage-1 spike,
   which only needed to prove the numbers existed). `airport_metrics_monthly` has a
   primary key of `(iata_code, year, month, data_scope)` — an annual row can't satisfy
   that. Rather than force annual data into a monthly key with a sentinel month value
   (which would misrepresent it), `scripts/fetch-t100-monthly.mjs` re-queries the same
   verified Socrata endpoint grouped by month instead of by year. Same source, same
   fields, correct grain.
2. **FAA TAF**: `data/out/faa-taf.json` is a base-year/horizon-year CAGR summary (again,
   built for the spike's narrower purpose). `airport_forecast_annual` needs one row per
   `(iata_code, year, scenario)` so downstream scoring can pick any year range. A new
   script, `scripts/parse-faa-taf-full.py`, re-parses the *same already-cached* TAF zip
   (`data/raw/APO100_TAF_Final_2025.zip`, downloaded once by stage 1) and emits the full
   ~400-row annual series to `data/out/faa-taf-annual.json`, which `ingest.mjs` then
   reads normally.

The On-Time congestion data (`data/out/ontime-*.json`) needed no adjustment — it was
already produced at monthly grain and is read as-is.

## How writes work

No Postgres driver dependency — `ingest.mjs` calls Supabase's PostgREST REST API
directly with `fetch()`, authenticated with `SUPABASE_SECRET_KEY` (service role, bypasses
the RLS enabled in stage 2). Every write sends `Prefer: resolution=merge-duplicates`,
which makes it an upsert against the table's primary key — safe to re-run.

## What gets loaded

| Table | Source | Rows (as run) |
|---|---|---|
| `airports` | hardcoded dimension (5 pilot airports; region tag is manual — no API publishes it) | 5 |
| `airport_metrics_monthly`, `data_scope='domestic_ontime'` | every `data/out/ontime-*.json` present | 5 (one month run so far) |
| `airport_metrics_monthly`, `data_scope='t100_all'` | fresh monthly Socrata query | 60 (5 airports × 12 months of 2025) |
| `airport_forecast_annual` | `data/out/faa-taf-annual.json` | 400 (5 airports × ~80 years × 2 scenarios) |

## Known limitation to state out loud

Only one On-Time month (2026-05) has been ingested so far — that file is produced
one month at a time by `scripts/test-bts-ontime.mjs YEAR MONTH` (each run downloads
~31 MB and streams a ~277 MB CSV, so it isn't looped over automatically here). Running
ingestion again after generating more `ontime-*.json` files picks them all up
automatically (the script globs `data/out/ontime-*.json`), no code change needed.
