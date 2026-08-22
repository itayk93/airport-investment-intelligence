# Stage 1 — Data Feasibility Spike

**Goal:** prove every metric behind the four required questions can be computed from a real,
reachable, keyless public source — before touching a database, an agent, or a UI.

## What was done

1. Picked 5 pilot airports: `SFO`, `LAX`, `SNA`, `ANC`, `BOS`.
2. Built a data map: for each of the 4 questions, which metric, from which source.
3. Found and hand-verified 3 sources by hitting their real endpoints:
   - BTS T-100 Segment Summary by Origin Airport (Socrata API)
   - BTS Reporting Carrier On-Time Performance (TranStats bulk CSV/ZIP)
   - FAA Terminal Area Forecast (bulk XLSX/ZIP)
4. Wrote one proof script per source (`scripts/test-*`) that each output real numbers
   for the 5 pilot airports, cached to `data/out/*.json`.

Full technical detail (endpoints, fields, quirks, sample output) lives in
[`DATA_PLAN.md`](DATA_PLAN.md) in this folder — that file is the source of truth for stage 1.
This doc is the narrative of *how* it was done and why.

## Key findings

- **No API key needed anywhere.** All three sources are open.
- BTS T-100 is a live queryable API (SoQL) — fastest to iterate on.
- BTS On-Time Performance is a monthly bulk ZIP (~31 MB → ~277 MB CSV, ~611k rows/month).
  Not an API — must be downloaded, cached, and streamed row-by-row rather than loaded
  into memory. This is the source for congestion metrics (delay, taxi-out, cancellations)
  and for the long-haul-share metric (via flight distance).
- FAA TAF is an annual bulk ZIP of XLSX files. `locid` values are space-padded
  (`'SFO '`) — must `.strip()`. `scenario` column: `0` = historical actual, `1` = forecast.
- One dead end found early: `taf.faa.gov/taf/downloadTAF.jsp` redirects to an error page.
  The working download is `taf.faa.gov/Downloads/APO100_TAF_Final_2025.zip`.

## Verified output (2026-08-22)

On-time performance, 2026-05, domestic reporting carriers:

| | SFO | LAX | SNA | ANC | BOS |
|---|---|---|---|---|---|
| avg dep delay (min) | 21.75 | 14.24 | 14.05 | 8.78 | 12.51 |
| % delayed >15 min | 31.73 | 20.41 | 19.89 | 13.34 | 18.01 |
| cancellation rate % | 0.79 | 0.54 | 0.78 | 0.61 | 0.61 |
| avg taxi-out (min) | 25.25 | 17.61 | 15.88 | 12.78 | 20.89 |
| NAS delay min/departure | 4.35 | 2.90 | 4.14 | 0.72 | 3.91 |
| long-haul share % (≥2000 mi) | 29.73 | 28.82 | 4.69 | 28.77 | 13.92 |

FAA TAF forecast enplanement growth, FY2024 → FY2035:
SFO **+39.6%** · BOS +28.5% · LAX +25.0% · ANC +22.8% · SNA +20.0%.

This single pass already answers all four assignment questions with real numbers:
SFO shows the highest forecast growth **and** the worst current congestion (the "unmet
demand" story); LAX vs SNA shows LAX has 4.3x SNA's volume but comparable delay, so SNA's
congestion isn't volume-driven; ANC's long-haul share is directly computable from flight
distance; New England just needs more IATA codes added to the same scripts (BDL, PVD,
MHT, PWM, BTV) — no new source required.

## Known gaps, stated explicitly (not hidden)

1. On-Time Performance is **US domestic only**, reporting carriers only. International
   legs at SFO/LAX are invisible there — T-100 fills that gap (it has domestic + intl).
2. **No dataset anywhere publishes runway/gate/terminal capacity.** "Unmet demand" and
   "capacity pressure" are therefore modeled proxies from delay/taxi/forecast data, never
   presented as if they were a published capacity figure. See stage 3 doc for the exact
   formulas and why they're kept as two distinct KPIs.
3. TAF is annual and only current through FY2024 actuals in this vintage.
4. The long-haul threshold (2000 miles) is our own definition, not a BTS standard —
   kept as a configurable constant in the script, not hardcoded logic.

## Artifacts produced

- [`DATA_PLAN.md`](DATA_PLAN.md) — full technical data map
- `scripts/test-bts-t100.mjs`, `scripts/test-bts-ontime.mjs`, `scripts/test-faa-taf.py`
- `data/out/*.json` — verified sample outputs (gitignored raw downloads in `data/raw/`)
