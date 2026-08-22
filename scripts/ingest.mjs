// Ingestion: loads stage-1 verified data into Supabase (schema: docs/02-database-schema.md).
//
// Sources, per row:
//   - airports              — built from public data, not hand-maintained: BTS On-Time
//                              supplies the origin set plus city/state, the FAA TAF
//                              Airports.xlsx supplies the official facility name and hub
//                              size, and region comes from the US Census division of the
//                              state (scripts/lib/regions.mjs). Coverage is therefore a
//                              consequence of what the sources report, not of a list
//                              someone picked.
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
import { regionForState } from './lib/regions.mjs';

loadEnv('.env');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SECRET_KEY — check .env');
}

// Airports below the On-Time sample floor are still loaded — the agent should be able to
// say "PVD is covered but too small to score" instead of "PVD does not exist". They are
// excluded from scoring, not from the dimension. See scripts/score.mjs.
const CHUNK = 1000; // PostgREST payload chunk; a single 20k-row body times out.

function buildAirports(ontimeRows) {
  const faa = new Map(
    (readJsonIfExists('data/out/faa-airports.json') ?? []).map((a) => [a.locid, a]),
  );
  const byCode = new Map();
  for (const r of ontimeRows) {
    if (byCode.has(r.airport)) continue;
    const f = faa.get(r.airport);
    byCode.set(r.airport, {
      iata_code: r.airport,
      // FAA's official facility name when the IATA code matches an FAA LOCID (it does for
      // the large majority); otherwise fall back to the BTS city so the row is never
      // nameless.
      name: f?.name || `${r.city ?? r.airport} Airport`,
      city: r.city ?? f?.city ?? null,
      state: r.state ?? f?.state ?? null,
      region: regionForState(r.state ?? f?.state),
      faa_locid: f ? f.locid : null,
    });
  }
  return [...byCode.values()].sort((a, b) => a.iata_code.localeCompare(b.iata_code));
}


async function upsert(table, rows, { onConflict } = {}) {
  if (!rows.length) return { table, count: 0 };
  // Chunked: coverage went from 5 airports to a few hundred, which turns single-request
  // bodies into tens of thousands of rows. Chunks keep each request small enough to
  // succeed and make a partial failure report which chunk died.
  for (let i = 0; i < rows.length; i += CHUNK) {
    await upsertChunk(table, rows.slice(i, i + CHUNK), onConflict);
  }
  return { table, count: rows.length };
}

async function upsertChunk(table, rows, onConflict) {
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

  // The On-Time files define coverage: an airport exists here if BTS reported departures
  // from it. Every other table is filtered to this set, because a T-100 or TAF row for an
  // airport with no congestion data cannot be scored and would only inflate the count.
  const ontimeFiles = readdirSync('data/out').filter((f) => /^ontime-\d{4}-\d{1,2}\.json$/.test(f));
  const ontimeRaw = ontimeFiles.flatMap((f) => readJsonIfExists(`data/out/${f}`) ?? []);
  const airportRows = buildAirports(ontimeRaw);
  const covered = new Set(airportRows.map((a) => a.iata_code));

  results.push(await upsert('airports', airportRows, { onConflict: 'iata_code' }));

  // 1. On-Time monthly metrics — every data/out/ontime-*.json produced so far.
  const ontimeRows = ontimeRaw.map(ontimeRowToMetric);
  results.push(
    await upsert('airport_metrics_monthly', ontimeRows, {
      onConflict: 'iata_code,year,month,data_scope',
    }),
  );

  // 2. T-100 monthly metrics — fetched fresh at the correct grain (see header comment).
  const t100Year = process.argv[2] ? Number(process.argv[2]) : 2025;
  const t100Rows = (await fetchT100Monthly(t100Year)).filter((r) => covered.has(r.iata_code));
  results.push(
    await upsert('airport_metrics_monthly', t100Rows, {
      onConflict: 'iata_code,year,month,data_scope',
    }),
  );

  // 3. FAA TAF annual forecast series. TAF keys on FAA LOCID; for these airports it equals
  //    the IATA code, and any facility where it does not simply has no forecast row and is
  //    reported as such rather than being silently matched to the wrong airport.
  const tafRows = (readJsonIfExists('data/out/faa-taf-annual.json') ?? [])
    .filter((r) => covered.has(r.airport))
    .map((r) => ({
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
