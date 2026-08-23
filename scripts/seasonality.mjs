// De-icing check — read-only. The scoring doc admits winter taxi-out at northern airports
// includes de-icing queues, which is delay a terminal cannot fix, and then leaves it as a
// caveat the agent recites. This quantifies it instead: rebuild every region's ranking from
// the non-winter months only, and report which airports were carried by winter.
//
// Nothing is written. Run: node scripts/seasonality.mjs
import { loadEnv } from './lib/env.mjs';
import { makeDb } from './lib/db.mjs';
import { groupBy, normalize, rawUnmetDemand } from './lib/scoring.mjs';

loadEnv('.env');
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SECRET_KEY');
const db = makeDb(SUPABASE_URL, SERVICE_KEY);

const CAPACITY_WEIGHTS = { taxiOut: 0.4, nasDelay: 0.35, pctDelayed15: 0.25 };
const EXPANSION_WEIGHTS = { unmetDemand: 0.5, forecastCagr: 0.3, capacityPressure: 0.2 };
// De-icing season. Chosen as a blunt calendar cut rather than a weather model: the point is
// to bound the effect, not to estimate it precisely.
const WINTER_MONTHS = new Set([12, 1, 2, 3]);

function averages(rows) {
  const avg = (key) => {
    const vals = rows.map((r) => r[key]).filter((v) => v != null).map(Number);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };
  return { months: rows.length, taxiOut: avg('avg_taxi_out_minutes'), nasDelay: avg('nas_delay_min_per_dep'), pctDelayed15: avg('pct_delayed_over_15') };
}

function rankRegion(members) {
  const normTaxiOut = normalize(members.map((m) => m.taxiOut));
  const normNasDelay = normalize(members.map((m) => m.nasDelay));
  const normPctDelayed = normalize(members.map((m) => m.pctDelayed15));
  const scored = members.map((m) => {
    const capacityPressure = +(
      CAPACITY_WEIGHTS.taxiOut * normTaxiOut(m.taxiOut) +
      CAPACITY_WEIGHTS.nasDelay * normNasDelay(m.nasDelay) +
      CAPACITY_WEIGHTS.pctDelayed15 * normPctDelayed(m.pctDelayed15)
    ).toFixed(4);
    return { ...m, capacityPressure, unmetDemandRaw: rawUnmetDemand(m.tafForecastCagrPct - m.t100HistoricalCagrPct, capacityPressure) };
  });
  const normUnmet = normalize(scored.map((m) => m.unmetDemandRaw));
  const normTafCagr = normalize(scored.map((m) => m.tafForecastCagrPct));
  return scored
    .map((m) => ({
      iata_code: m.iata_code,
      capacityPressure: m.capacityPressure,
      expansionScore: +(
        EXPANSION_WEIGHTS.unmetDemand * normUnmet(m.unmetDemandRaw) +
        EXPANSION_WEIGHTS.forecastCagr * normTafCagr(m.tafForecastCagrPct) +
        EXPANSION_WEIGHTS.capacityPressure * m.capacityPressure
      ).toFixed(4),
    }))
    .sort((a, b) => b.expansionScore - a.expansionScore);
}

async function getChunked(table, codes, makeQuery, chunk = 80) {
  const out = [];
  for (let i = 0; i < codes.length; i += chunk) out.push(...(await db.get(table, makeQuery(codes.slice(i, i + chunk)))));
  return out;
}

async function main() {
  const scoreRows = await db.get('airport_scores', 'select=iata_code,comparison_set_id,computed_at,inputs_json&order=computed_at.desc');
  const latest = new Map();
  for (const row of scoreRows) if (!latest.has(row.iata_code)) latest.set(row.iata_code, row);

  const codes = [...latest.keys()];
  const monthly = await getChunked(
    'airport_metrics_monthly',
    codes,
    (c) => `iata_code=in.(${c.join(',')})&data_scope=eq.domestic_ontime&select=iata_code,year,month,avg_taxi_out_minutes,nas_delay_min_per_dep,pct_delayed_over_15`,
  );
  const byAirport = groupBy(monthly, 'iata_code');

  const allRegions = new Map();
  const summerRegions = new Map();
  for (const [code, row] of latest) {
    const i = row.inputs_json ?? {};
    if (i.tafForecastCagrPct == null || i.t100HistoricalCagrPct == null) continue;
    const rows = byAirport.get(code) ?? [];
    const nonWinter = rows.filter((r) => !WINTER_MONTHS.has(Number(r.month)));
    const full = averages(rows);
    const warm = averages(nonWinter);
    if (full.taxiOut == null || warm.taxiOut == null) continue;
    const base = { iata_code: code, tafForecastCagrPct: i.tafForecastCagrPct, t100HistoricalCagrPct: i.t100HistoricalCagrPct };
    if (!allRegions.has(row.comparison_set_id)) { allRegions.set(row.comparison_set_id, []); summerRegions.set(row.comparison_set_id, []); }
    allRegions.get(row.comparison_set_id).push({ ...base, ...full });
    summerRegions.get(row.comparison_set_id).push({ ...base, ...warm, winterTaxiDeltaMin: +(full.taxiOut - warm.taxiOut).toFixed(2) });
  }

  console.log(`de-icing sensitivity — all 12 months vs. ${12 - WINTER_MONTHS.size} non-winter months (Dec-Mar excluded)\n`);

  const movers = [];
  let topFlips = 0;
  for (const [region, members] of allRegions) {
    const full = rankRegion(members).map((r) => r.iata_code);
    const warmRanked = rankRegion(summerRegions.get(region));
    const warm = warmRanked.map((r) => r.iata_code);
    if (full[0] !== warm[0]) topFlips++;
    const warmRank = Object.fromEntries(warm.map((code, i) => [code, i]));
    for (const [i, code] of full.entries()) {
      const shift = i - warmRank[code];
      const delta = summerRegions.get(region).find((m) => m.iata_code === code)?.winterTaxiDeltaMin ?? 0;
      // Report the airports whose place in the ranking depends on winter, plus anything
      // with a large winter taxi-out premium even if its rank held.
      if (Math.abs(shift) >= 3 || delta >= 2) {
        movers.push({ region, airport: code, 'rank (12mo)': i + 1, 'rank (non-winter)': warmRank[code] + 1, 'winter taxi-out premium (min)': delta });
      }
    }
  }

  console.log(`regions where the top-ranked airport changes without winter: ${topFlips}/${allRegions.size}\n`);
  console.table(movers.sort((a, b) => b['winter taxi-out premium (min)'] - a['winter taxi-out premium (min)']).slice(0, 20));

  for (const region of ['New England', 'Pacific']) {
    if (!allRegions.has(region)) continue;
    console.log(`\n${region}`);
    console.table([
      { basis: 'all 12 months', top3: rankRegion(allRegions.get(region)).slice(0, 3).map((r) => `${r.iata_code} ${r.expansionScore}`).join('  ') },
      { basis: 'non-winter only', top3: rankRegion(summerRegions.get(region)).slice(0, 3).map((r) => `${r.iata_code} ${r.expansionScore}`).join('  ') },
    ]);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
