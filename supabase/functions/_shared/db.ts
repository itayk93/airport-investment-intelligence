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

// Scores are computed per region, so there is no single global comparison set any more.
// Each scored airport belongs to exactly one regional set, carried on the row as
// `comparison_set_id`. Callers report that value rather than assuming one name.
// See docs/14-coverage-expansion.md.

export async function checkRateLimit(bucket: string, limit: number, window: string) {
  const rows = await sql<{ allowed: boolean }[]>`
    select check_rate_limit(${bucket}, ${limit}, ${window}::interval) as allowed
  `;
  return rows[0]?.allowed === true;
}

/**
 * Short-lived WhatsApp conversation memory. Twilio delivers one message with no history,
 * so follow-up questions need the previous turns from somewhere; the web chat sends its
 * own. Keyed by the salted hash of the sender, never the number. See
 * supabase/migrations/20260823000000_whatsapp_conversation_memory.sql.
 */
export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export async function recentWhatsappTurns(
  conversationHash: string,
  limit = 8,
): Promise<ConversationTurn[]> {
  const rows = await sql<ConversationTurn[]>`
    select role, content from recent_whatsapp_turns(${conversationHash}, ${limit})
  `;
  return rows.map((row: ConversationTurn) => ({ role: row.role, content: row.content }));
}

export async function recordWhatsappTurn(
  conversationHash: string,
  role: 'user' | 'assistant',
  content: string,
) {
  await sql`select record_whatsapp_turn(${conversationHash}, ${role}, ${content})`;
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

/**
 * Every covered airport, with whether it is actually scored. Coverage and scoreability are
 * different things now: a small airport is in the data but is excluded from ranking for
 * sample-size reasons, and the agent must be able to tell a user which of the two applies.
 */
export function listAirports() {
  return sql`
    select a.iata_code, a.name, a.city, a.state, a.region,
           (s.iata_code is not null) as scored,
           a.score_exclusion_reason,
           s.comparison_set_id,
           s.capacity_pressure, s.unmet_demand_score,
           s.forecast_growth_gap_pct, s.expansion_score
    from airports a
    left join lateral (
      select s.iata_code, s.comparison_set_id, s.capacity_pressure,
             s.unmet_demand_score, s.forecast_growth_gap_pct, s.expansion_score
      from airport_scores s
      where s.iata_code = a.iata_code
      order by s.computed_at desc
      limit 1
    ) s on true
    order by a.iata_code
  `;
}

/**
 * Just the words that name an airport — codes, cities, states, regions. The scope guard
 * builds its vocabulary from this instead of a hardcoded list of the five pilot airports,
 * so a question about any covered airport is recognised as in scope.
 */
export function getScopeVocabulary() {
  return sql`select iata_code, city, state, region from airports`;
}

/** Count for the public UI, which does not need the full airport directory payload. */
export async function getAirportCount(): Promise<number> {
  const rows = await sql<{ count: number }[]>`select count(*)::int as count from airports`;
  return rows[0]?.count ?? 0;
}

/** Scores joined to airport names — the shape both the ranking panel and the agent want. */
export function getScores(codes: string[] = []) {
  // airport_scores retains scoring history. Select one newest row per airport before
  // ranking so rerunning scripts/score.mjs cannot expose stale and current scores together.
  const latest = sql`
    select distinct on (s.iata_code)
           s.iata_code, a.name, a.city, a.state, a.region,
           s.comparison_set_id,
           s.capacity_pressure, s.forecast_growth_gap_pct, s.unmet_demand_score,
           s.long_haul_share_pct, s.expansion_score, s.computed_at
    from airport_scores s
    join airports a on a.iata_code = s.iata_code
    order by s.iata_code, s.computed_at desc
  `;
  // Ordering is by comparison set first: expansion_score is only meaningful against an
  // airport's regional peers, so an unsegmented national sort would invite exactly the
  // cross-region comparison the model is not making.
  return codes.length
    ? sql`select * from (${latest}) latest
          where iata_code in ${sql(codes)}
          order by comparison_set_id, expansion_score desc nulls last`
    : sql`select * from (${latest}) latest
          order by comparison_set_id, expansion_score desc nulls last`;
}

export function getMetrics(
  codes: string[],
  scope: 'domestic_ontime' | 't100_all',
  fromPeriod = 0,
  toPeriod = 999999,
) {
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
      and (year, month) >= (${Math.floor(fromPeriod / 100)}, ${fromPeriod % 100})
      and (year, month) <= (${Math.floor(toPeriod / 100)}, ${toPeriod % 100})
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
           max(year * 100 + month) as last_period, count(*) as rows,
           count(distinct year * 100 + month) as months
    from airport_metrics_monthly
    group by data_scope
  `;
}

// The congestion-coverage sentence both the panel and the prompt use lives in
// coverage.ts — pure formatting, no connection, so it can be tested without a database.
export { type CoverageRow, describeCongestionCoverage } from './coverage.ts';
