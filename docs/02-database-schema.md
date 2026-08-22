# Stage 2 — Database Schema Design

Designed only after stage 1 proved which fields actually exist in the real sources.
No column here is speculative — every field maps to something verified in
`DATA_PLAN.md` / `data/out/*.json`.

DDL: `supabase/schema.sql`. Not yet applied to a live Supabase project — this is the
design to review before linking one.

## Tables

### `airports` (dimension)

One row per airport. IATA code is the natural key used everywhere else.

| column | type | source |
|---|---|---|
| `iata_code` | text, PK | user-defined pilot list |
| `icao_code` | text, nullable | FAA TAF `Airports.xlsx` (not yet ingested, placeholder) |
| `name` | text | FAA TAF / BTS |
| `city` | text | BTS `origin_city_name` |
| `state` | text | BTS `origin_state` |
| `region` | text, nullable | manual tag, e.g. `'New England'` — needed for the New England question, not published by any source |
| `faa_locid` | text | FAA TAF `locid` (space-stripped) |

### `airport_metrics_monthly` (fact — congestion + volume, from On-Time + T-100)

One row per `(airport, year, month)`. This is the workhorse table — Capacity Pressure,
Long-Haul Share, and the historical side of the Forecast Growth Gap all read from here.

| column | type | source field |
|---|---|---|
| `iata_code` | text, FK → airports | — |
| `year` | int | `Year` |
| `month` | int | `Month` |
| `departures` | int | On-Time: count of rows / T-100: `total_departures` |
| `passengers` | int | T-100 `total_passengers` |
| `seats` | int | T-100 `total_seats` |
| `load_factor_pct` | numeric | derived: passengers/seats |
| `domestic_departures` | int | T-100 `domestic_departures` |
| `avg_dep_delay_minutes` | numeric | On-Time `DepDelayMinutes` avg |
| `pct_delayed_over_15` | numeric | On-Time `DepDel15` |
| `cancellation_rate_pct` | numeric | On-Time `Cancelled` |
| `diversion_rate_pct` | numeric | On-Time `Diverted` |
| `avg_taxi_out_minutes` | numeric | On-Time `TaxiOut` avg |
| `nas_delay_min_per_dep` | numeric | On-Time `NASDelay` avg |
| `weather_delay_min_per_dep` | numeric | On-Time `WeatherDelay` avg |
| `carrier_delay_min_per_dep` | numeric | On-Time `CarrierDelay` avg |
| `late_aircraft_delay_min_per_dep` | numeric | On-Time `LateAircraftDelay` avg |
| `avg_stage_length_miles` | numeric | On-Time `Distance` avg |
| `long_haul_departures` | int | On-Time, `Distance >= long_haul_threshold_miles` |
| `long_haul_share_pct` | numeric | derived |
| `data_scope` | text | `'domestic_ontime'` or `'t100_all'` — **required**, because On-Time and T-100 rows for the same month cover different flight populations and must never be silently merged |

Primary key: `(iata_code, year, month, data_scope)`.

### `airport_forecast_annual` (fact — FAA TAF)

One row per `(airport, year, scenario)`.

| column | type | source field |
|---|---|---|
| `iata_code` | text, FK → airports | `locid` (stripped) |
| `year` | int | `ayear` |
| `scenario` | smallint | `scenario` (0 = historical actual, 1 = forecast) |
| `enplanements` | bigint | sum of `aac+aat+commuter+us_flag+frgn_flag` |
| `operations` | bigint | sum of `itn_Ac+itn_at+itn_ga+itn_mil+loc_ga+loc_mil` |

Primary key: `(iata_code, year, scenario)`.

### `airport_scores` (derived — output of stage 3 scoring, not raw ingestion)

One row per `(airport, computed_at, comparison_set_id)` — scores are only meaningful
relative to the set of airports they were computed against, so the comparison set is
part of the identity, not an afterthought.

| column | type |
|---|---|
| `iata_code` | text, FK → airports |
| `comparison_set_id` | text — the airport's US Census region, e.g. `'New England'`, `'Pacific'` (stage 14; was `'pilot-5'`) |
| `computed_at` | timestamptz |
| `capacity_pressure` | numeric [0,1] |
| `forecast_growth_gap_pct` | numeric |
| `unmet_demand_score` | numeric |
| `long_haul_share_pct` | numeric |
| `expansion_score` | numeric |
| `inputs_json` | jsonb — raw inputs snapshot, for reproducibility/debugging the score without re-querying history |

This table is what the agent's tool calls read at chat time — it never recomputes
scores live inside a conversation turn; scoring is a separate deterministic batch step
(stage 3 script), and the agent explains numbers that already exist.

## Region choice

Supabase project region: **East US (North Virginia / us-east-1)**.

Rationale: the data domain (BTS/FAA aviation data) and the business use case (US airport
investment) are both US-centric. Hosting close to the data source and target market
minimizes latency for any scheduled ingestion jobs pulling from `transtats.bts.gov` /
`taf.faa.gov`, and matches where a real deployment would serve US-based analysts. The
developer's own location (Israel) is irrelevant to this choice — it affects dev-time
dashboard/query latency only, not the architecture. The market/data determines region,
not the developer's location.

## Design decisions worth flagging

- **`data_scope` on the metrics table, not two separate tables** — chosen so a single
  query can `WHERE data_scope = ...` per-metric rather than joining two tables for every
  question. Revisit if the two sources' column sets diverge further.
- **Scores are materialized, not computed on read** — keeps the agent's tool-call layer
  simple (`SELECT` only) and keeps scoring fully deterministic/auditable outside the LLM
  loop, per the assignment's explicit requirement.
- **No capacity/runway/gate table** — deliberately absent. Confirmed in stage 1 that no
  such public dataset exists; adding an empty/speculative table would misrepresent that.
