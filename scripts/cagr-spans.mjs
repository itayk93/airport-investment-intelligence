// Historical-span check — read-only. The forecast growth gap subtracts an airport's own
// measured CAGR from the FAA's forecast CAGR, and that measured CAGR is taken from two
// endpoints, 2014 and 2024. COVID sits between them: an airport that had not fully
// recovered by 2024 reads as a slow-growing airport, and its gap widens for a reason that
// is a pandemic, not demand.
//
// This rebuilds every region's ranking using three different historical spans and reports
// how far the ranking moves. Nothing is written. Run: node scripts/cagr-spans.mjs
import { loadEnv } from './lib/env.mjs';
import { makeDb } from './lib/db.mjs';
import { normalize, rawUnmetDemand } from './lib/scoring.mjs';

loadEnv('.env');
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SECRET_KEY');
const db = makeDb(SUPABASE_URL, SERVICE_KEY);

const CAPACITY_WEIGHTS = { taxiOut: 0.4, nasDelay: 0.35, pctDelayed15: 0.25 };
const EXPANSION_WEIGHTS = { unmetDemand: 0.5, forecastCagr: 0.3, capacityPressure: 0.2 };

// Baseline first. The other two bracket the pandemic instead of spanning it: 2016-2019 is
// entirely pre-COVID, 2019-2024 is entirely recovery. If the ranking survives both, the
// 2014-2024 span is not smuggling a pandemic artefact into the growth gap.
const SPANS = [
  { name: '2014 to 2024 (shipped, spans COVID)', from: 2014, to: 2024 },
  { name: '2016 to 2019 (pre-COVID only)', from: 2016, to: 2019 },
  { name: '2019 to 2024 (recovery only)', from: 2019, to: 2024 },
];

function cagr(start, end, years) {
  return start && end && years > 0 ? +(((end / start) ** (1 / years) - 1) * 100).toFixed(3) : null;
}

async function fetchT100AnnualPassengers(year) {
  const url = 'https://data.bts.gov/resource/r495-tyji.json?' + new URLSearchParams({
    $select: 'origin_airport_code,sum(total_passengers) as passengers',
    $where: `year='${year}'`,
    $group: 'origin_airport_code',
    $limit: '50000',
  });
  const rows = await fetch(url).then((r) => r.json());
  return Object.fromEntries(rows.map((r) => [r.origin_airport_code, +r.passengers]));
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
    return { ...m, capacityPressure, unmetDemandRaw: rawUnmetDemand(m.tafForecastCagrPct - m.historicalCagrPct, capacityPressure) };
  });
  const normUnmet = normalize(scored.map((m) => m.unmetDemandRaw));
  const normTafCagr = normalize(scored.map((m) => m.tafForecastCagrPct));
  return scored
    .map((m) => ({
      iata_code: m.iata_code,
      growthGapPct: +(m.tafForecastCagrPct - m.historicalCagrPct).toFixed(2),
      expansionScore: +(
        EXPANSION_WEIGHTS.unmetDemand * normUnmet(m.unmetDemandRaw) +
        EXPANSION_WEIGHTS.forecastCagr * normTafCagr(m.tafForecastCagrPct) +
        EXPANSION_WEIGHTS.capacityPressure * m.capacityPressure
      ).toFixed(4),
    }))
    .sort((a, b) => b.expansionScore - a.expansionScore);
}

function spearman(orderA, orderB) {
  const n = orderA.length;
  if (n < 2) return null;
  const rankB = Object.fromEntries(orderB.map((code, i) => [code, i]));
  const sumD2 = orderA.reduce((sum, code, i) => sum + (i - rankB[code]) ** 2, 0);
  return +(1 - (6 * sumD2) / (n * (n * n - 1))).toFixed(3);
}

async function main() {
  const rows = await db.get('airport_scores', 'select=iata_code,comparison_set_id,computed_at,inputs_json&order=computed_at.desc');
  const latest = new Map();
  for (const row of rows) if (!latest.has(row.iata_code)) latest.set(row.iata_code, row);

  const years = [...new Set(SPANS.flatMap((s) => [s.from, s.to]))];
  const passengersByYear = Object.fromEntries(
    await Promise.all(years.map(async (year) => [year, await fetchT100AnnualPassengers(year)])),
  );

  // Only airports with T-100 actuals at every endpoint are compared, so all three spans
  // rank the identical membership. Dropping a different subset per span would make the
  // rank correlations meaningless.
  const usable = [];
  for (const [code, row] of latest) {
    const i = row.inputs_json ?? {};
    if ([i.taxiOut, i.nasDelay, i.pctDelayed15, i.tafForecastCagrPct].some((v) => v == null)) continue;
    if (years.some((year) => !passengersByYear[year][code])) continue;
    usable.push({ region: row.comparison_set_id, iata_code: code, ...i });
  }
  console.log(`historical-span sensitivity — ${usable.length} of ${latest.size} scored airports have T-100 actuals at every endpoint\n`);

  const rankings = SPANS.map((span) => {
    const byRegion = new Map();
    for (const m of usable) {
      const historicalCagrPct = cagr(passengersByYear[span.from][m.iata_code], passengersByYear[span.to][m.iata_code], span.to - span.from);
      if (historicalCagrPct == null) continue;
      if (!byRegion.has(m.region)) byRegion.set(m.region, []);
      byRegion.get(m.region).push({ ...m, historicalCagrPct });
    }
    return { span, byRegion: new Map([...byRegion].map(([region, members]) => [region, rankRegion(members)])) };
  });

  const [baseline, ...alternates] = rankings;
  const summary = alternates.map(({ span, byRegion }) => {
    let topFlips = 0;
    const rhos = [];
    let worst = 0;
    for (const [region, ranked] of byRegion) {
      const base = baseline.byRegion.get(region).map((r) => r.iata_code);
      const alt = ranked.map((r) => r.iata_code);
      if (base[0] !== alt[0]) topFlips++;
      const rho = spearman(base, alt);
      if (rho != null) rhos.push(rho);
      const rankAlt = Object.fromEntries(alt.map((c, i) => [c, i]));
      worst = Math.max(worst, ...base.map((c, i) => Math.abs(i - rankAlt[c])));
    }
    return {
      'historical span': span.name,
      'regions where #1 changed': `${topFlips}/${byRegion.size}`,
      'mean Spearman rho vs shipped': +(rhos.reduce((s, v) => s + v, 0) / rhos.length).toFixed(3),
      'worst rank shift': worst,
    };
  });
  console.table(summary);

  for (const region of ['New England', 'Pacific']) {
    if (!baseline.byRegion.has(region)) continue;
    console.log(`\n${region} — top 3, and the growth gap each span produces`);
    console.table(rankings.map(({ span, byRegion }) => ({
      'historical span': span.name,
      top3: byRegion.get(region).slice(0, 3).map((r) => `${r.iata_code} ${r.expansionScore} (gap ${r.growthGapPct}pp)`).join('  '),
    })));
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
