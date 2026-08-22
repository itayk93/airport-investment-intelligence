// Single source of truth for every database read in this project.
//
// Both edge functions import from here: agent-chat wraps these as LLM tools, airport-data
// exposes two of them as REST for the UI panel. Same queries, one definition — the tool
// layer and the UI can never drift apart or disagree about what a score means.
//
// Connects as `agent_reader`: SELECT grants only, 5s statement_timeout. Every query below
// is parameterized; nothing here concatenates SQL. See docs/09-agent-architecture.md.
import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

const DSN = Deno.env.get('AGENT_READER_DSN');
if (!DSN) throw new Error('AGENT_READER_DSN is not set');

const sql = postgres(DSN, { max: 2, idle_timeout: 20, prepare: false });

export const COMPARISON_SET = 'pilot-5';

export async function checkRateLimit(bucket: string, limit: number, window: string) {
  const rows = await sql<{ allowed: boolean }[]>`
    select check_rate_limit(${bucket}, ${limit}, ${window}::interval) as allowed
  `;
  return rows[0]?.allowed === true;
}

/** Uppercase, validate as 3-letter IATA, cap the list. Bounds every airport-scoped query. */
export function asIataCodes(value: unknown, limit = 20): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]{3}$/.test(s))
    .slice(0, limit);
}

export function listAirports() {
  return sql`
    select iata_code, name, city, state, region
    from airports
    order by iata_code
  `;
}

/** Scores joined to airport names — the shape both the ranking panel and the agent want. */
export function getScores(codes: string[] = []) {
  // airport_scores retains scoring history. Select one newest row per airport before
  // ranking so rerunning scripts/score.mjs cannot expose stale and current scores together.
  const latest = sql`
    select distinct on (s.iata_code)
           s.iata_code, a.name, a.city, a.state, a.region,
           s.capacity_pressure, s.forecast_growth_gap_pct, s.unmet_demand_score,
           s.long_haul_share_pct, s.expansion_score, s.inputs_json, s.computed_at
    from airport_scores s
    join airports a on a.iata_code = s.iata_code
    where s.comparison_set_id = ${COMPARISON_SET}
    order by s.iata_code, s.computed_at desc
  `;
  return codes.length
    ? sql`select * from (${latest}) latest
          where iata_code in ${sql(codes)} order by expansion_score desc nulls last`
    : sql`select * from (${latest}) latest order by expansion_score desc nulls last`;
}

export function getMetrics(codes: string[], scope: 'domestic_ontime' | 't100_all') {
  return sql`
    select iata_code, year, month, data_scope, departures, passengers, seats,
           load_factor_pct, avg_dep_delay_minutes, pct_delayed_over_15,
           cancellation_rate_pct, diversion_rate_pct, avg_taxi_out_minutes,
           nas_delay_min_per_dep, weather_delay_min_per_dep,
           carrier_delay_min_per_dep, late_aircraft_delay_min_per_dep,
           avg_stage_length_miles, long_haul_departures, long_haul_share_pct,
           long_haul_threshold_miles
    from airport_metrics_monthly
    where iata_code in ${sql(codes)} and data_scope = ${scope}
    order by iata_code, year, month
    limit 500
  `;
}

export function getForecast(codes: string[], fromYear: number, toYear: number) {
  return sql`
    select iata_code, year, scenario, enplanements, operations
    from airport_forecast_annual
    where iata_code in ${sql(codes)} and year between ${fromYear} and ${toYear}
    order by iata_code, year, scenario
    limit 500
  `;
}

/** Which congestion months actually exist — so the UI/agent never imply coverage they lack. */
export function getCoverage() {
  return sql`
    select data_scope, min(year * 100 + month) as first_period,
           max(year * 100 + month) as last_period, count(*) as rows
    from airport_metrics_monthly
    group by data_scope
  `;
}
