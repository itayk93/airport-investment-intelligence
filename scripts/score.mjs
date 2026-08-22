// Deterministic scoring — implements docs/03-scoring-methodology.md exactly. Reads
// ingested data from Supabase, writes one row per scored airport to airport_scores. This
// is the non-LLM ranking/comparison logic the assignment requires; the agent explains
// these numbers, it never computes or invents them at chat time.
//
// Two things differ from the original 5-airport version, both forced by coverage growing
// to every BTS origin airport (see docs/14-coverage-expansion.md):
//
//   1. The comparison set is the airport's REGION, not one global list. Min-max
//      normalisation is relative by construction, so a single national set would stretch
//      the scale between the busiest and quietest US airports and compress every regional
//      difference to nothing. Ranking an airport against its regional peers is also the
//      question actually being asked ("candidates in New England"), not a workaround.
//   2. Airports below the sample floor, or missing a forecast, are NOT scored. They stay
//      in the airports table and are reported as unscored with a reason, because a score
//      computed from 40 departures is worse than no score.
//
// Run: node scripts/score.mjs
import { loadEnv } from './lib/env.mjs';
import { makeDb } from './lib/db.mjs';
import { normalize, rawUnmetDemand } from './lib/scoring.mjs';

loadEnv('.env');
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SECRET_KEY');
const db = makeDb(SUPABASE_URL, SERVICE_KEY);

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

// Same floor the extraction step applies (scripts/test-bts-ontime.mjs). Repeated here
// because scoring reads the database, not the JSON, and must not depend on the extractor
// having filtered anything out.
const MIN_DEPARTURES_PER_MONTH = 300;
// A min-max set of one or two airports is not a ranking — every member lands on 0, 0.5 or
// 1 by arithmetic, regardless of the underlying values. Such regions are reported as
// unscored rather than given scores that look comparable to a real region's.
const MIN_REGION_SIZE = 3;

function cagr(start, end, years) {
  return start && end && years > 0 ? +(((end / start) ** (1 / years) - 1) * 100).toFixed(3) : null;
}

/** One Socrata request per year for every US origin — see fetch-t100-monthly.mjs. */
async function fetchT100AnnualPassengers(year) {
  const url =
    'https://data.bts.gov/resource/r495-tyji.json?' +
    new URLSearchParams({
      $select: 'origin_airport_code,sum(total_passengers) as passengers',
      $where: `year='${year}'`,
      $group: 'origin_airport_code',
      $limit: '50000',
    });
  const rows = await fetch(url).then((r) => r.json());
  return Object.fromEntries(rows.map((r) => [r.origin_airport_code, +r.passengers]));
}

/** Chunked `in.()` reads — a few hundred codes overflow a PostgREST query string. */
async function getChunked(table, codes, makeQuery, chunk = 80) {
  const out = [];
  for (let i = 0; i < codes.length; i += chunk) {
    out.push(...(await db.get(table, makeQuery(codes.slice(i, i + chunk)))));
  }
  return out;
}

async function main() {
  // Every row written by this run shares a timestamp boundary, used at the end to drop
  // earlier runs. Without that, an airport that WAS scored and is no longer eligible keeps
  // its stale row as the newest one for that airport, and the "latest per airport" read in
  // supabase/functions/_shared/db.ts would serve a score the current model does not stand
  // behind. Scores are a materialised view of the current model, not an audit log.
  const runStartedAt = new Date().toISOString();

  const airports = await db.get('airports', 'select=iata_code,name,region&order=iata_code');
  const codes = airports.map((a) => a.iata_code);
  const regionOf = Object.fromEntries(airports.map((a) => [a.iata_code, a.region]));

  // 1. Congestion inputs (Capacity Pressure) — averaged across whatever domestic_ontime
  //    months have been ingested. `departures` comes along to enforce the sample floor.
  const ontimeRows = await getChunked(
    'airport_metrics_monthly',
    codes,
    (c) =>
      `iata_code=in.(${c.join(',')})&data_scope=eq.domestic_ontime&select=iata_code,departures,avg_taxi_out_minutes,nas_delay_min_per_dep,pct_delayed_over_15,long_haul_share_pct`,
  );

  const congestion = {};
  for (const a of codes) {
    const rows = ontimeRows.filter((r) => r.iata_code === a);
    const avg = (key) => {
      const vals = rows.map((r) => r[key]).filter((v) => v != null).map(Number);
      return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    };
    const totalDeps = rows.reduce((s, r) => s + Number(r.departures ?? 0), 0);
    congestion[a] = {
      months: rows.length,
      departures: totalDeps,
      avgDeparturesPerMonth: rows.length ? Math.round(totalDeps / rows.length) : 0,
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
  const tafRows = await getChunked(
    'airport_forecast_annual',
    codes,
    (c) =>
      `iata_code=in.(${c.join(',')})&year=in.(${TAF_BASE_YEAR},${TAF_HORIZON_YEAR})&select=iata_code,year,scenario,enplanements`,
  );

  const raw = {};
  for (const a of codes) {
    const base = tafRows.find((r) => r.iata_code === a && r.year === TAF_BASE_YEAR)?.enplanements;
    const horizon = tafRows.find((r) => r.iata_code === a && r.year === TAF_HORIZON_YEAR)?.enplanements;
    raw[a] = {
      ...congestion[a],
      region: regionOf[a],
      t100HistoricalCagrPct: cagr(histBase[a], histEnd[a], T100_HIST_END_YEAR - T100_HIST_BASE_YEAR),
      tafForecastCagrPct: cagr(base, horizon, TAF_HORIZON_YEAR - TAF_BASE_YEAR),
    };
  }

  // 4. Eligibility. Each exclusion carries a reason so the agent can answer "why isn't X
  //    ranked?" from data instead of guessing.
  const unscored = [];
  const eligible = codes.filter((a) => {
    const r = raw[a];
    const reason =
      !r.region ? 'no region mapping for its state'
      : r.months === 0 ? 'no BTS On-Time month ingested'
      : r.avgDeparturesPerMonth < MIN_DEPARTURES_PER_MONTH
        ? `below the ${MIN_DEPARTURES_PER_MONTH} departures/month sample floor (${r.avgDeparturesPerMonth})`
      : r.taxiOut == null || r.nasDelay == null || r.pctDelayed15 == null ? 'missing a congestion input'
      : r.tafForecastCagrPct == null ? 'no FAA TAF forecast for this facility'
      : r.t100HistoricalCagrPct == null ? 'no BTS T-100 actuals for the historical span'
      : null;
    if (reason) unscored.push({ iata_code: a, region: r.region, reason });
    return !reason;
  });

  // 5. Score inside each region. Regions too small to rank are dropped with a reason.
  const byRegion = new Map();
  for (const a of eligible) {
    if (!byRegion.has(raw[a].region)) byRegion.set(raw[a].region, []);
    byRegion.get(raw[a].region).push(a);
  }

  const scoreRows = [];
  for (const [region, members] of [...byRegion].sort()) {
    if (members.length < MIN_REGION_SIZE) {
      for (const a of members) {
        unscored.push({
          iata_code: a,
          region,
          reason: `only ${members.length} scoreable airport(s) in ${region} — too few for a relative ranking`,
        });
      }
      continue;
    }

    // Capacity Pressure — relative to this region only (docs/03, section 1).
    const normTaxiOut = normalize(members.map((a) => raw[a].taxiOut));
    const normNasDelay = normalize(members.map((a) => raw[a].nasDelay));
    const normPctDelayed = normalize(members.map((a) => raw[a].pctDelayed15));

    for (const a of members) {
      raw[a].capacityPressure = +(
        CAPACITY_WEIGHTS.taxiOut * normTaxiOut(raw[a].taxiOut) +
        CAPACITY_WEIGHTS.nasDelay * normNasDelay(raw[a].nasDelay) +
        CAPACITY_WEIGHTS.pctDelayed15 * normPctDelayed(raw[a].pctDelayed15)
      ).toFixed(4);
    }

    // Forecast Growth Gap + Unmet Demand — gated by Capacity Pressure (docs/03, section 3):
    // high forecast growth with LOW current congestion is healthy growth, not unmet demand.
    for (const a of members) {
      raw[a].forecastGrowthGapPct = +(raw[a].tafForecastCagrPct - raw[a].t100HistoricalCagrPct).toFixed(3);
      raw[a].unmetDemandScoreRaw = rawUnmetDemand(raw[a].forecastGrowthGapPct, raw[a].capacityPressure);
    }

    // Expansion Score — composite ranking KPI (docs/03, section 5).
    const normUnmetDemand = normalize(members.map((a) => raw[a].unmetDemandScoreRaw));
    const normTafCagr = normalize(members.map((a) => raw[a].tafForecastCagrPct));

    for (const a of members) {
      raw[a].comparisonSetSize = members.length;
      raw[a].unmetDemandScore = normUnmetDemand(raw[a].unmetDemandScoreRaw);
      raw[a].expansionScore = +(
        EXPANSION_WEIGHTS.unmetDemand * raw[a].unmetDemandScore +
        EXPANSION_WEIGHTS.forecastCagr * normTafCagr(raw[a].tafForecastCagrPct) +
        EXPANSION_WEIGHTS.capacityPressure * raw[a].capacityPressure
      ).toFixed(4);

      scoreRows.push({
        iata_code: a,
        comparison_set_id: region,
        capacity_pressure: raw[a].capacityPressure,
        forecast_growth_gap_pct: raw[a].forecastGrowthGapPct,
        unmet_demand_score: raw[a].unmetDemandScore,
        long_haul_share_pct: raw[a].longHaulSharePct,
        expansion_score: raw[a].expansionScore,
        inputs_json: raw[a],
      });
    }
  }

  for (let i = 0; i < scoreRows.length; i += 500) await db.insert('airport_scores', scoreRows.slice(i, i + 500));
  // Only after every insert succeeded, so a failed run leaves the previous scores intact.
  await db.remove('airport_scores', `computed_at=lt.${runStartedAt}`);

  // Write the exclusion reasons back onto the dimension so the agent can answer "why isn't
  // X ranked?" from data instead of inferring it. Scored airports are cleared, so a row
  // never keeps a reason from a previous run's stricter thresholds.
  // Clear first, then write — so an airport that became scoreable does not keep a stale
  // reason if the write below never reaches it.
  await db.patch('airports', 'score_exclusion_reason=not.is.null', { score_exclusion_reason: null });
  const byReason = new Map();
  for (const u of unscored) {
    if (!byReason.has(u.reason)) byReason.set(u.reason, []);
    byReason.get(u.reason).push(u.iata_code);
  }
  for (const [reason, members] of byReason) {
    for (let i = 0; i < members.length; i += 80) {
      await db.patch('airports', `iata_code=in.(${members.slice(i, i + 80).join(',')})`, {
        score_exclusion_reason: reason,
      });
    }
  }

  const regionCounts = [...byRegion].map(([r, m]) => `${r}: ${m.length}`).sort();
  console.log(`scored ${scoreRows.length} airports across ${new Set(scoreRows.map((r) => r.comparison_set_id)).size} regions`);
  console.log(regionCounts.join('\n'));
  const reasonCounts = {};
  for (const u of unscored) {
    // Collapse the numeric detail so the tally groups by cause, not by value.
    const key = u.reason.replace(/\(\d+\)/, '').trim();
    reasonCounts[key] = (reasonCounts[key] ?? 0) + 1;
  }
  console.log(`\nunscored: ${unscored.length}`);
  for (const [reason, n] of Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n}  ${reason}`);
  }
  console.table(
    scoreRows
      .filter((r) => r.comparison_set_id === 'New England')
      .sort((a, b) => b.expansion_score - a.expansion_score)
      .map((r) => ({
        airport: r.iata_code,
        capacityPressure: r.capacity_pressure,
        forecastGrowthGapPct: r.forecast_growth_gap_pct,
        unmetDemandScore: r.unmet_demand_score,
        expansionScore: r.expansion_score,
      })),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
