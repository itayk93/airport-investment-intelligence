-- Close Supabase's broad default grants. RLS currently blocks direct access, but explicit
-- least privilege keeps a future policy change from silently exposing writes.
revoke all on table public.airports from anon, authenticated;
revoke all on table public.airport_metrics_monthly from anon, authenticated;
revoke all on table public.airport_forecast_annual from anon, authenticated;
revoke all on table public.airport_scores from anon, authenticated;
revoke all on table public.rate_limit_hits from anon, authenticated, agent_reader;

-- SECURITY DEFINER bypasses caller RLS. Supabase default privileges had granted these
-- functions directly to API roles, so revoking only PUBLIC was insufficient.
revoke all on function public.check_rate_limit(text, integer, interval)
  from public, anon, authenticated;
revoke all on function public.cleanup_rate_limit_hits()
  from public, anon, authenticated, agent_reader;
grant execute on function public.check_rate_limit(text, integer, interval) to agent_reader;

-- Secure future objects created by the migration owner. service_role retains its normal
-- administrative grants; ingestion uses that role deliberately.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

-- Add checks without a table rewrite. Validation scans each small table after the
-- constraint exists, preventing future bad writes during the scan.
alter table public.airports
  add constraint airports_iata_code_format_chk
  check (iata_code ~ '^[A-Z]{3}$') not valid;

alter table public.airport_metrics_monthly
  add constraint airport_metrics_monthly_nonnegative_chk
  check (
    (departures is null or departures >= 0)
    and (passengers is null or passengers >= 0)
    and (seats is null or seats >= 0)
    and (domestic_departures is null or domestic_departures >= 0)
    and (avg_taxi_out_minutes is null or avg_taxi_out_minutes >= 0)
    and (nas_delay_min_per_dep is null or nas_delay_min_per_dep >= 0)
    and (weather_delay_min_per_dep is null or weather_delay_min_per_dep >= 0)
    and (carrier_delay_min_per_dep is null or carrier_delay_min_per_dep >= 0)
    and (late_aircraft_delay_min_per_dep is null or late_aircraft_delay_min_per_dep >= 0)
    and (avg_stage_length_miles is null or avg_stage_length_miles >= 0)
    and (long_haul_departures is null or long_haul_departures >= 0)
    and (long_haul_threshold_miles is null or long_haul_threshold_miles > 0)
  ) not valid,
  add constraint airport_metrics_monthly_percentages_chk
  check (
    (load_factor_pct is null or load_factor_pct between 0 and 100)
    and (pct_delayed_over_15 is null or pct_delayed_over_15 between 0 and 100)
    and (cancellation_rate_pct is null or cancellation_rate_pct between 0 and 100)
    and (diversion_rate_pct is null or diversion_rate_pct between 0 and 100)
    and (long_haul_share_pct is null or long_haul_share_pct between 0 and 100)
  ) not valid;

alter table public.airport_forecast_annual
  add constraint airport_forecast_annual_nonnegative_chk
  check (
    (enplanements is null or enplanements >= 0)
    and (operations is null or operations >= 0)
  ) not valid;

alter table public.airport_scores
  add constraint airport_scores_unit_interval_chk
  check (
    (capacity_pressure is null or capacity_pressure between 0 and 1)
    and (unmet_demand_score is null or unmet_demand_score between 0 and 1)
    and (expansion_score is null or expansion_score between 0 and 1)
  ) not valid,
  add constraint airport_scores_long_haul_share_chk
  check (long_haul_share_pct is null or long_haul_share_pct between 0 and 100) not valid;

alter table public.airports validate constraint airports_iata_code_format_chk;
alter table public.airport_metrics_monthly
  validate constraint airport_metrics_monthly_nonnegative_chk;
alter table public.airport_metrics_monthly
  validate constraint airport_metrics_monthly_percentages_chk;
alter table public.airport_forecast_annual
  validate constraint airport_forecast_annual_nonnegative_chk;
alter table public.airport_scores validate constraint airport_scores_unit_interval_chk;
alter table public.airport_scores validate constraint airport_scores_long_haul_share_chk;

-- Index replacement is intentionally applied outside db push with CREATE/DROP INDEX
-- CONCURRENTLY: Supabase's migration pipeline runs transactionally and PostgreSQL forbids
-- concurrent index operations inside that pipeline. supabase/schema.sql records the final
-- baseline shape for new environments.
