// Deterministic scoring — implements docs/03-scoring-methodology.md exactly. Reads
// ingested data from Supabase, writes one row per airport to airport_scores. This is
// the non-LLM ranking/comparison logic the assignment requires; the agent explains
// these numbers, it never computes or invents them at chat time.
//
// Run: node scripts/score.mjs
import { loadEnv } from './lib/env.mjs';
import { makeDb } from './lib/db.mjs';

loadEnv('.env');
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SECRET_KEY');
const db = makeDb(SUPABASE_URL, SERVICE_KEY);

const AIRPORTS = ['SFO', 'LAX', 'SNA', 'ANC', 'BOS'];
const COMPARISON_SET_ID = 'pilot-5';

// Named weights — declared assumptions, not fitted to data. See docs/03 for rationale
// and docs/04 (talking points, section 5) for the honest "no empirical basis" caveat.
const CAPACITY_WEIGHTS = { taxiOut: 0.4, nasDelay: 0.35, pctDelayed15: 0.25 };
const EXPANSION_WEIGHTS = { unmetDemand: 0.5, forecastCagr: 0.3, capacityPressure: 0.2 };

// Historical actual span (BTS T-100, independently measured) vs forecast span (FAA TAF).
// Different lengths (10y vs 11y) because T-100 only goes back to 2014 — noted, not hidden.
const T100_HIST_BASE_YEAR = 2014;
const T100_HIST_END_YEAR = 2024;
const TAF_BASE_YEAR = 2024;
const TAF_HORIZON_YEAR = 2035;

function cagr(start, end, years) {
  return start && end && years > 0 ? +(((end / start) ** (1 / years) - 1) * 100).toFixed(3) : null;
}

function normalize(values) {
  const nums = values.filter((v) => v != null);
  const min = Math.min(...nums), max = Math.max(...nums);
  return (v) => (v == null ? null : max === min ? 0.5 : +((v - min) / (max - min)).toFixed(4));
}

async function fetchT100AnnualPassengers(year) {
  const url =
    'https://data.bts.gov/resource/r495-tyji.json?' +
    new URLSearchParams({
      $select: 'origin_airport_code,sum(total_passengers) as passengers',
      $where: `origin_airport_code in('${AIRPORTS.join("','")}') and year='${year}'`,
      $group: 'origin_airport_code',
    });
  const rows = await fetch(url).then((r) => r.json());
  return Object.fromEntries(rows.map((r) => [r.origin_airport_code, +r.passengers]));
}

async function main() {
  // 1. Congestion inputs (Capacity Pressure) — average across whatever domestic_ontime
  //    months have been ingested so far (currently one: 2026-05).
  const ontimeRows = await db.get(
    'airport_metrics_monthly',
    `iata_code=in.(${AIRPORTS.join(',')})&data_scope=eq.domestic_ontime&select=iata_code,avg_taxi_out_minutes,nas_delay_min_per_dep,pct_delayed_over_15,long_haul_share_pct`,
  );
  const congestion = {};
  for (const a of AIRPORTS) {
    const rows = ontimeRows.filter((r) => r.iata_code === a);
    const avg = (key) => (rows.length ? rows.reduce((s, r) => s + Number(r[key] ?? 0), 0) / rows.length : null);
    congestion[a] = {
      taxiOut: avg('avg_taxi_out_minutes'),
      nasDelay: avg('nas_delay_min_per_dep'),
      pctDelayed15: avg('pct_delayed_over_15'),
      longHaulSharePct: avg('long_haul_share_pct'),
    };
  }

  // 2. Historical enplanement CAGR — independently measured from BTS T-100 (not FAA's
  //    own historical estimate), so the forecast gap compares FAA's forecast against a
  //    different source's actuals rather than FAA vs. FAA.
  const [histBase, histEnd] = await Promise.all([
    fetchT100AnnualPassengers(T100_HIST_BASE_YEAR),
    fetchT100AnnualPassengers(T100_HIST_END_YEAR),
  ]);

  // 3. Forecast enplanements from FAA TAF, already ingested.
  const tafRows = await db.get(
    'airport_forecast_annual',
    `iata_code=in.(${AIRPORTS.join(',')})&year=in.(${TAF_BASE_YEAR},${TAF_HORIZON_YEAR})&select=iata_code,year,scenario,enplanements`,
  );

  const raw = {};
  for (const a of AIRPORTS) {
    const base = tafRows.find((r) => r.iata_code === a && r.year === TAF_BASE_YEAR)?.enplanements;
    const horizon = tafRows.find((r) => r.iata_code === a && r.year === TAF_HORIZON_YEAR)?.enplanements;
    raw[a] = {
      ...congestion[a],
      t100HistoricalCagrPct: cagr(histBase[a], histEnd[a], T100_HIST_END_YEAR - T100_HIST_BASE_YEAR),
      tafForecastCagrPct: cagr(base, horizon, TAF_HORIZON_YEAR - TAF_BASE_YEAR),
    };
  }

  // 4. Capacity Pressure — relative to this comparison set only (docs/03, section 1).
  const normTaxiOut = normalize(AIRPORTS.map((a) => raw[a].taxiOut));
  const normNasDelay = normalize(AIRPORTS.map((a) => raw[a].nasDelay));
  const normPctDelayed = normalize(AIRPORTS.map((a) => raw[a].pctDelayed15));

  for (const a of AIRPORTS) {
    raw[a].capacityPressure = +(
      CAPACITY_WEIGHTS.taxiOut * normTaxiOut(raw[a].taxiOut) +
      CAPACITY_WEIGHTS.nasDelay * normNasDelay(raw[a].nasDelay) +
      CAPACITY_WEIGHTS.pctDelayed15 * normPctDelayed(raw[a].pctDelayed15)
    ).toFixed(4);
  }

  // 5. Forecast Growth Gap + Unmet Demand — gated by Capacity Pressure (docs/03, section 3):
  //    high forecast growth with LOW current congestion is healthy growth, not unmet demand.
  for (const a of AIRPORTS) {
    raw[a].forecastGrowthGapPct = +(raw[a].tafForecastCagrPct - raw[a].t100HistoricalCagrPct).toFixed(3);
    raw[a].unmetDemandScoreRaw = +(raw[a].forecastGrowthGapPct * raw[a].capacityPressure).toFixed(4);
  }

  // 6. Expansion Score — composite ranking KPI (docs/03, section 5).
  const normUnmetDemand = normalize(AIRPORTS.map((a) => raw[a].unmetDemandScoreRaw));
  const normTafCagr = normalize(AIRPORTS.map((a) => raw[a].tafForecastCagrPct));

  for (const a of AIRPORTS) {
    raw[a].unmetDemandScore = normUnmetDemand(raw[a].unmetDemandScoreRaw);
    raw[a].expansionScore = +(
      EXPANSION_WEIGHTS.unmetDemand * raw[a].unmetDemandScore +
      EXPANSION_WEIGHTS.forecastCagr * normTafCagr(raw[a].tafForecastCagrPct) +
      EXPANSION_WEIGHTS.capacityPressure * raw[a].capacityPressure
    ).toFixed(4);
  }

  const scoreRows = AIRPORTS.map((a) => ({
    iata_code: a,
    comparison_set_id: COMPARISON_SET_ID,
    capacity_pressure: raw[a].capacityPressure,
    forecast_growth_gap_pct: raw[a].forecastGrowthGapPct,
    unmet_demand_score: raw[a].unmetDemandScore,
    long_haul_share_pct: raw[a].longHaulSharePct,
    expansion_score: raw[a].expansionScore,
    inputs_json: raw[a],
  }));

  await db.insert('airport_scores', scoreRows);

  console.table(
    AIRPORTS.map((a) => ({
      airport: a,
      capacityPressure: raw[a].capacityPressure,
      forecastGrowthGapPct: raw[a].forecastGrowthGapPct,
      unmetDemandScore: raw[a].unmetDemandScore,
      longHaulSharePct: raw[a].longHaulSharePct,
      expansionScore: raw[a].expansionScore,
    })),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
