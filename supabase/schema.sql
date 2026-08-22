-- Airport Investment Intelligence Agent — schema
-- Design rationale: docs/02-database-schema.md
-- Baseline schema applied to the linked Supabase project. Later changes belong in migrations.

create table if not exists airports (
  iata_code   text primary key check (iata_code ~ '^[A-Z]{3}$'),
  icao_code   text,
  name        text not null,
  city        text,
  state       text,
  region      text,
  faa_locid   text,
  -- Why an airport is covered but not ranked, written by scripts/score.mjs on every run.
  -- Kept as data rather than left to the agent to infer: "PVD is covered but below the
  -- sample floor" is an answer the model must be able to read, not guess. Null while
  -- scoring has not run; scored airports are reset to null.
  score_exclusion_reason text
);

alter table airports add column if not exists score_exclusion_reason text;

create table if not exists airport_metrics_monthly (
  iata_code                         text not null references airports (iata_code),
  year                              int  not null,
  month                             int  not null check (month between 1 and 12),
  data_scope                        text not null check (data_scope in ('domestic_ontime', 't100_all')),

  departures                        int check (departures >= 0),
  passengers                        bigint check (passengers >= 0),
  seats                             bigint check (seats >= 0),
  load_factor_pct                   numeric check (load_factor_pct between 0 and 100),
  domestic_departures               int check (domestic_departures >= 0),

  avg_dep_delay_minutes             numeric,
  pct_delayed_over_15               numeric check (pct_delayed_over_15 between 0 and 100),
  cancellation_rate_pct             numeric check (cancellation_rate_pct between 0 and 100),
  diversion_rate_pct                numeric check (diversion_rate_pct between 0 and 100),
  avg_taxi_out_minutes              numeric check (avg_taxi_out_minutes >= 0),
  nas_delay_min_per_dep             numeric check (nas_delay_min_per_dep >= 0),
  weather_delay_min_per_dep         numeric check (weather_delay_min_per_dep >= 0),
  carrier_delay_min_per_dep         numeric check (carrier_delay_min_per_dep >= 0),
  late_aircraft_delay_min_per_dep   numeric check (late_aircraft_delay_min_per_dep >= 0),

  avg_stage_length_miles            numeric check (avg_stage_length_miles >= 0),
  long_haul_departures              int check (long_haul_departures >= 0),
  long_haul_share_pct               numeric check (long_haul_share_pct between 0 and 100),
  long_haul_threshold_miles         int default 2000 check (long_haul_threshold_miles > 0),

  primary key (iata_code, year, month, data_scope)
);

create index if not exists idx_metrics_airport_scope_time
  on airport_metrics_monthly (iata_code, data_scope, year, month);

create table if not exists airport_forecast_annual (
  iata_code     text not null references airports (iata_code),
  year          int  not null,
  scenario      smallint not null check (scenario in (0, 1)), -- 0 = historical actual, 1 = forecast
  enplanements  bigint check (enplanements >= 0),
  operations    bigint check (operations >= 0),

  primary key (iata_code, year, scenario)
);

create table if not exists airport_scores (
  iata_code             text not null references airports (iata_code),
  comparison_set_id     text not null,
  computed_at           timestamptz not null default now(),

  capacity_pressure       numeric check (capacity_pressure between 0 and 1),
  forecast_growth_gap_pct numeric,
  unmet_demand_score      numeric check (unmet_demand_score between 0 and 1),
  long_haul_share_pct     numeric check (long_haul_share_pct between 0 and 100),
  expansion_score         numeric check (expansion_score between 0 and 1),

  inputs_json           jsonb,

  primary key (iata_code, comparison_set_id, computed_at)
);

create index if not exists idx_scores_latest
  on airport_scores (comparison_set_id, computed_at desc);
