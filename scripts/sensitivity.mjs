// Weight sensitivity check — read-only. Answers the question the scoring doc leaves open
// (docs/04, "Open items"): if the weights are a judgment call, how much of the ranking
// actually depends on them?
//
// Recomputes every region's ranking under alternate weightings from the SAME stored inputs
// (airport_scores.inputs_json), and reports how far each ranking moves. Nothing is written;
// this never touches airport_scores.
//
// Run: node scripts/sensitivity.mjs
import { loadEnv } from './lib/env.mjs';
import { makeDb } from './lib/db.mjs';
import { normalize, rawUnmetDemand } from './lib/scoring.mjs';

loadEnv('.env');
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SECRET_KEY');
const db = makeDb(SUPABASE_URL, SERVICE_KEY);

// Baseline is the shipped model. The variants are deliberately spread wide — equal weights,
// each congestion signal dominant, and an expansion score that leans entirely on one term —
// so this is a stress test, not a nudge.
const BASELINE = {
  name: 'baseline (shipped)',
  capacity: { taxiOut: 0.4, nasDelay: 0.35, pctDelayed15: 0.25 },
  expansion: { unmetDemand: 0.5, forecastCagr: 0.3, capacityPressure: 0.2 },
};
const VARIANTS = [
  { name: 'equal congestion weights', capacity: { taxiOut: 1 / 3, nasDelay: 1 / 3, pctDelayed15: 1 / 3 }, expansion: BASELINE.expansion },
  { name: 'taxi-out dominant', capacity: { taxiOut: 0.7, nasDelay: 0.15, pctDelayed15: 0.15 }, expansion: BASELINE.expansion },
  { name: 'NAS delay dominant', capacity: { taxiOut: 0.15, nasDelay: 0.7, pctDelayed15: 0.15 }, expansion: BASELINE.expansion },
  { name: 'delay frequency dominant', capacity: { taxiOut: 0.15, nasDelay: 0.15, pctDelayed15: 0.7 }, expansion: BASELINE.expansion },
  { name: 'equal expansion weights', capacity: BASELINE.capacity, expansion: { unmetDemand: 1 / 3, forecastCagr: 1 / 3, capacityPressure: 1 / 3 } },
  { name: 'unmet demand only', capacity: BASELINE.capacity, expansion: { unmetDemand: 1, forecastCagr: 0, capacityPressure: 0 } },
  { name: 'forecast growth only', capacity: BASELINE.capacity, expansion: { unmetDemand: 0, forecastCagr: 1, capacityPressure: 0 } },
  { name: 'congestion only', capacity: BASELINE.capacity, expansion: { unmetDemand: 0, forecastCagr: 0, capacityPressure: 1 } },
];

/** One region's expansion ranking under a given weighting. Mirrors scripts/score.mjs. */
function scoreRegion(members, weights) {
  const normTaxiOut = normalize(members.map((m) => m.taxiOut));
  const normNasDelay = normalize(members.map((m) => m.nasDelay));
  const normPctDelayed = normalize(members.map((m) => m.pctDelayed15));

  const withPressure = members.map((m) => ({
    ...m,
    capacityPressure: +(
      weights.capacity.taxiOut * normTaxiOut(m.taxiOut) +
      weights.capacity.nasDelay * normNasDelay(m.nasDelay) +
      weights.capacity.pctDelayed15 * normPctDelayed(m.pctDelayed15)
    ).toFixed(4),
  }));

  const withRaw = withPressure.map((m) => ({
    ...m,
    unmetDemandRaw: rawUnmetDemand(m.tafForecastCagrPct - m.t100HistoricalCagrPct, m.capacityPressure),
  }));

  const normUnmet = normalize(withRaw.map((m) => m.unmetDemandRaw));
  const normTafCagr = normalize(withRaw.map((m) => m.tafForecastCagrPct));

  return withRaw
    .map((m) => ({
      iata_code: m.iata_code,
      capacityPressure: m.capacityPressure,
      unmetDemandScore: normUnmet(m.unmetDemandRaw),
      expansionScore: +(
        weights.expansion.unmetDemand * normUnmet(m.unmetDemandRaw) +
        weights.expansion.forecastCagr * normTafCagr(m.tafForecastCagrPct) +
        weights.expansion.capacityPressure * m.capacityPressure
      ).toFixed(4),
    }))
    .sort((a, b) => b.expansionScore - a.expansionScore);
}

/** Spearman rank correlation between two orderings of the same members. */
function spearman(orderA, orderB) {
  const n = orderA.length;
  if (n < 2) return null;
  const rankB = Object.fromEntries(orderB.map((code, i) => [code, i]));
  const sumD2 = orderA.reduce((sum, code, i) => sum + (i - rankB[code]) ** 2, 0);
  return +(1 - (6 * sumD2) / (n * (n * n - 1))).toFixed(3);
}

function maxRankShift(orderA, orderB) {
  const rankB = Object.fromEntries(orderB.map((code, i) => [code, i]));
  return orderA.reduce((worst, code, i) => Math.max(worst, Math.abs(i - rankB[code])), 0);
}

async function main() {
  // inputs_json carries the raw per-airport inputs each score was built from, so every
  // variant below is recomputed from identical data — the weights are the only thing
  // that changes.
  const rows = await db.get(
    'airport_scores',
    'select=iata_code,comparison_set_id,computed_at,inputs_json&order=computed_at.desc',
  );
  const latest = new Map();
  for (const row of rows) if (!latest.has(row.iata_code)) latest.set(row.iata_code, row);

  const regions = new Map();
  for (const row of latest.values()) {
    const i = row.inputs_json ?? {};
    if ([i.taxiOut, i.nasDelay, i.pctDelayed15, i.tafForecastCagrPct, i.t100HistoricalCagrPct].some((v) => v == null)) continue;
    if (!regions.has(row.comparison_set_id)) regions.set(row.comparison_set_id, []);
    regions.get(row.comparison_set_id).push({ iata_code: row.iata_code, ...i });
  }

  const baselineByRegion = new Map(
    [...regions].map(([region, members]) => [region, scoreRegion(members, BASELINE)]),
  );

  console.log(`weight sensitivity — ${latest.size} scored airports, ${regions.size} regions\n`);

  const summary = [];
  for (const variant of VARIANTS) {
    let topFlips = 0;
    let top3Churn = 0;
    const rhos = [];
    let worstShift = 0;
    for (const [region, members] of regions) {
      const base = baselineByRegion.get(region).map((r) => r.iata_code);
      const alt = scoreRegion(members, variant).map((r) => r.iata_code);
      if (base[0] !== alt[0]) topFlips++;
      const baseTop3 = new Set(base.slice(0, 3));
      top3Churn += alt.slice(0, 3).filter((code) => !baseTop3.has(code)).length;
      const rho = spearman(base, alt);
      if (rho != null) rhos.push(rho);
      worstShift = Math.max(worstShift, maxRankShift(base, alt));
    }
    summary.push({
      variant: variant.name,
      'regions where #1 changed': `${topFlips}/${regions.size}`,
      'top-3 members swapped': top3Churn,
      'mean Spearman ρ vs baseline': +(rhos.reduce((s, v) => s + v, 0) / rhos.length).toFixed(3),
      'worst single-airport rank shift': worstShift,
    });
  }
  console.table(summary);

  // Named regions, spelled out — the aggregate above hides whether the answers actually
  // given in the demo are the stable ones.
  for (const region of ['New England', 'Pacific']) {
    if (!regions.has(region)) continue;
    console.log(`\n${region} — top 3 under each weighting`);
    const rowsOut = [{ weighting: BASELINE.name, top3: baselineByRegion.get(region).slice(0, 3).map((r) => `${r.iata_code} ${r.expansionScore}`).join('  ') }];
    for (const variant of VARIANTS) {
      rowsOut.push({
        weighting: variant.name,
        top3: scoreRegion(regions.get(region), variant).slice(0, 3).map((r) => `${r.iata_code} ${r.expansionScore}`).join('  '),
      });
    }
    console.table(rowsOut);
  }

  // The expansion score double-counts by construction: UnmetDemand already contains
  // capacity pressure and forecast growth, so the nominal 0.2 on capacity pressure is not
  // its real influence. Reported rather than left for a reviewer to notice.
  console.log(
    '\nnote: expansion weights are nominal, not effective — unmet demand (0.5) is itself\n' +
    'gap x pressure, so capacity pressure and forecast growth each enter the composite twice.\n' +
    'The "unmet demand only" and "congestion only" variants above bound that overlap.',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
