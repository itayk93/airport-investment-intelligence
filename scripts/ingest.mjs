// Ingestion: loads stage-1 verified data into Supabase (schema: docs/02-database-schema.md).
//
// Sources, per row:
//   - airports              — hardcoded dimension for the 5 pilot airports (no public API
//                              publishes "airport region tags" like New England; this is
//                              the one deliberately manual table).
//   - airport_metrics_monthly (domestic_ontime) — read straight from
//                              data/out/ontime-*.json, already at the right (airport,
//                              year, month) grain.
//   - airport_metrics_monthly (t100_all)        — fetched fresh at monthly grain via
//                              fetch-t100-monthly.mjs, because the stage-1 spike file
//                              data/out/t100-2025.json is an annual roll-up and cannot
//                              satisfy this table's monthly primary key.
//   - airport_forecast_annual — read from data/out/faa-taf-annual.json (produced by
//                              parse-faa-taf-full.py from the same cached TAF zip stage 1
//                              downloaded; the stage-1 spike file faa-taf.json only has a
//                              base/horizon summary, not the per-year series this table needs).
//
// Writes via PostgREST (REST API) with the service key, not a Postgres driver — avoids
// adding a DB client dependency for a one-off ingestion script. `Prefer:
// resolution=merge-duplicates` makes every write an upsert on the table's primary key.
import { readFileSync, readdirSync } from 'node:fs';
import { loadEnv } from './lib/env.mjs';
import { fetchT100Monthly } from './fetch-t100-monthly.mjs';

loadEnv('.env');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SECRET_KEY — check .env');
}

const AIRPORTS = [
  { iata_code: 'SFO', name: 'San Francisco International Airport', city: 'San Francisco', state: 'CA', region: null, faa_locid: 'SFO' },
  { iata_code: 'LAX', name: 'Los Angeles International Airport', city: 'Los Angeles', state: 'CA', region: null, faa_locid: 'LAX' },
  { iata_code: 'SNA', name: 'John Wayne Airport (Santa Ana)', city: 'Santa Ana', state: 'CA', region: null, faa_locid: 'SNA' },
  { iata_code: 'ANC', name: 'Ted Stevens Anchorage International Airport', city: 'Anchorage', state: 'AK', region: null, faa_locid: 'ANC' },
  { iata_code: 'BOS', name: 'Boston Logan International Airport', city: 'Boston', state: 'MA', region: 'New England', faa_locid: 'BOS' },
];

async function upsert(table, rows, { onConflict } = {}) {
  if (!rows.length) return { table, count: 0 };
  const url = `${SUPABASE_URL}/rest/v1/${table}${onConflict ? `?on_conflict=${onConflict}` : ''}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`upsert ${table} failed: ${res.status} ${body}`);
  }
  return { table, count: rows.length };
}

function readJsonIfExists(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function ontimeRowToMetric(r) {
  const [year, month] = r.period.split('-').map(Number);
  return {
    iata_code: r.airport,
    year,
    month,
    data_scope: 'domestic_ontime',
    departures: r.departures,
    avg_dep_delay_minutes: r.avgDepartureDelayMinutes,
    pct_delayed_over_15: r.pctDelayedOver15,
    cancellation_rate_pct: r.cancellationRatePct,
    diversion_rate_pct: r.diversionRatePct,
    avg_taxi_out_minutes: r.avgTaxiOutMinutes,
    nas_delay_min_per_dep: r.nasDelayMinutesPerDeparture,
    weather_delay_min_per_dep: r.weatherDelayMinutesPerDeparture,
    carrier_delay_min_per_dep: r.carrierDelayMinutesPerDeparture,
    late_aircraft_delay_min_per_dep: r.lateAircraftDelayMinutesPerDeparture,
    avg_stage_length_miles: r.avgStageLengthMiles,
    long_haul_departures: r.longHaulDepartures,
    long_haul_share_pct: r.longHaulSharePct,
    long_haul_threshold_miles: r.longHaulThresholdMiles,
  };
}

async function main() {
  const results = [];

  results.push(await upsert('airports', AIRPORTS, { onConflict: 'iata_code' }));

  // 1. On-Time monthly metrics — every data/out/ontime-*.json produced so far.
  const ontimeFiles = readdirSync('data/out').filter((f) => /^ontime-\d{4}-\d{1,2}\.json$/.test(f));
  const ontimeRows = ontimeFiles.flatMap((f) => readJsonIfExists(`data/out/${f}`).map(ontimeRowToMetric));
  results.push(
    await upsert('airport_metrics_monthly', ontimeRows, {
      onConflict: 'iata_code,year,month,data_scope',
    }),
  );

  // 2. T-100 monthly metrics — fetched fresh at the correct grain (see header comment).
  const t100Year = process.argv[2] ? Number(process.argv[2]) : 2025;
  const t100Rows = await fetchT100Monthly(t100Year);
  results.push(
    await upsert('airport_metrics_monthly', t100Rows, {
      onConflict: 'iata_code,year,month,data_scope',
    }),
  );

  // 3. FAA TAF annual forecast series.
  const tafRows = (readJsonIfExists('data/out/faa-taf-annual.json') ?? []).map((r) => ({
    iata_code: r.airport,
    year: r.year,
    scenario: r.scenario,
    enplanements: r.enplanements,
    operations: r.operations,
  }));
  results.push(
    await upsert('airport_forecast_annual', tafRows, {
      onConflict: 'iata_code,year,scenario',
    }),
  );

  for (const r of results) console.log(`${r.table}: upserted ${r.count} rows`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
