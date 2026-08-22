-- Airport Investment Intelligence Agent — schema
-- Design rationale: docs/02-database-schema.md
-- Not yet applied to a live project. Review before running against Supabase.

create table if not exists airports (
  iata_code   text primary key,
  icao_code   text,
  name        text not null,
  city        text,
  state       text,
  region      text,
  faa_locid   text
);

create table if not exists airport_metrics_monthly (
  iata_code                         text not null references airports (iata_code),
  year                              int  not null,
  month                             int  not null check (month between 1 and 12),
  data_scope                        text not null check (data_scope in ('domestic_ontime', 't100_all')),

  departures                        int,
  passengers                        bigint,
  seats                             bigint,
  load_factor_pct                   numeric,
  domestic_departures               int,

  avg_dep_delay_minutes             numeric,
  pct_delayed_over_15               numeric,
  cancellation_rate_pct             numeric,
  diversion_rate_pct                numeric,
  avg_taxi_out_minutes              numeric,
  nas_delay_min_per_dep             numeric,
  weather_delay_min_per_dep         numeric,
  carrier_delay_min_per_dep         numeric,
  late_aircraft_delay_min_per_dep   numeric,

  avg_stage_length_miles            numeric,
  long_haul_departures               int,
  long_haul_share_pct                numeric,
  long_haul_threshold_miles          int default 2000,

  primary key (iata_code, year, month, data_scope)
);

create index if not exists idx_metrics_airport_time
  on airport_metrics_monthly (iata_code, year, month);

create table if not exists airport_forecast_annual (
  iata_code     text not null references airports (iata_code),
  year          int  not null,
  scenario      smallint not null check (scenario in (0, 1)), -- 0 = historical actual, 1 = forecast
  enplanements  bigint,
  operations    bigint,

  primary key (iata_code, year, scenario)
);

create table if not exists airport_scores (
  iata_code             text not null references airports (iata_code),
  comparison_set_id     text not null,
  computed_at           timestamptz not null default now(),

  capacity_pressure       numeric,
  forecast_growth_gap_pct numeric,
  unmet_demand_score      numeric,
  long_haul_share_pct     numeric,
  expansion_score         numeric,

  inputs_json           jsonb,

  primary key (iata_code, comparison_set_id, computed_at)
);

create index if not exists idx_scores_latest
  on airport_scores (comparison_set_id, computed_at desc);
