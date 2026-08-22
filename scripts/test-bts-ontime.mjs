// Proof-of-data: BTS Reporting Carrier On-Time Performance (TranStats PREZIP, no API key).
// Usage: node scripts/test-bts-ontime.mjs [YEAR] [MONTH]
// Downloads ~31 MB zip -> streams ~277 MB CSV. First run ~3 min, then cached in data/raw/.
import { createReadStream, existsSync, mkdirSync, writeFileSync, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import { execFileSync } from 'node:child_process';

// Coverage: every origin airport in the file, not a hand-picked list. A hand-picked list
// makes any "which airport in region X" answer a function of the list rather than of the
// data. Small origins are still aggregated here and filtered at output by MIN_DEPARTURES.
const LONG_HAUL_MILES = 2000; // assumption; BTS publishes no long-haul flag
// Sample-size floor. Below this, a single bad day moves avg_taxi_out_minutes and
// nas_delay_min_per_dep enough to outrank a genuinely congested hub. Airports under the
// floor are written out with `sufficientSample: false` so downstream code can report
// "not enough data" instead of ranking noise.
const MIN_DEPARTURES = 100;
const [year = '2026', month = '5'] = process.argv.slice(2);

const name = `On_Time_Reporting_Carrier_On_Time_Performance_1987_present_${year}_${month}`;
const url = `https://transtats.bts.gov/PREZIP/${name}.zip`;
const zipPath = `data/raw/${name}.zip`;
const csvDir = `data/raw/${name}`;

mkdirSync('data/raw', { recursive: true });

if (!existsSync(csvDir)) {
  if (!existsSync(zipPath)) {
    // Liveness check: HEAD always 200 on this host, so probe with a Range request.
    const probe = await fetch(url, { headers: { Range: 'bytes=0-0' } });
    const total = probe.headers.get('content-range')?.split('/')[1];
    if (!total || +total < 1e6) throw new Error(`${name}: not published yet (got ${total ?? 'no range'} bytes)`);
    console.error(`downloading ${url} (${(+total / 1e6).toFixed(0)} MB) ...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`PREZIP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(zipPath));
  }
  execFileSync('unzip', ['-oq', zipPath, '-d', csvDir]);
}

const csv = `${csvDir}/${name.replace('1987_present', '(1987_present)')}.csv`;

// Minimal RFC4180 splitter — this file quotes city names containing commas.
const splitCsv = (line) => {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
};

const rl = createInterface({ input: createReadStream(csv), crlfDelay: Infinity });
let col = null;
const agg = new Map();
const blank = () => ({
  city: null, state: null,
  flights: 0, cancelled: 0, diverted: 0, del15: 0,
  depDelaySum: 0, depDelayN: 0, taxiOutSum: 0, taxiOutN: 0,
  nasDelaySum: 0, weatherDelaySum: 0, carrierDelaySum: 0, lateAircraftDelaySum: 0,
  longHaul: 0, distanceSum: 0,
});

for await (const line of rl) {
  if (!col) {
    const h = splitCsv(line).map((s) => s.replace(/^﻿/, ''));
    col = Object.fromEntries(h.map((n, i) => [n, i]));
    continue;
  }
  if (!line) continue;

  const f = splitCsv(line);
  const origin = f[col.Origin];
  if (!origin) continue;

  let s = agg.get(origin);
  if (!s) agg.set(origin, (s = blank()));
  // Dimension attributes ride along with the fact rows — BTS publishes them per flight,
  // so the airports table needs no separate hand-maintained source.
  if (s.city === null) {
    // OriginCityName is "Boston, MA" — the state is already its own column, so keep the
    // city half only and avoid storing the state twice in different formats.
    s.city = (f[col.OriginCityName] ?? '').split(',')[0].trim() || null;
    s.state = f[col.OriginState] || null;
  }

  s.flights++;
  const cancelled = +f[col.Cancelled] === 1;
  if (cancelled) s.cancelled++;
  if (+f[col.Diverted] === 1) s.diverted++;

  const dist = +f[col.Distance] || 0;
  s.distanceSum += dist;
  if (dist >= LONG_HAUL_MILES) s.longHaul++;

  if (!cancelled) {
    const d = f[col.DepDelayMinutes];
    if (d !== '') { s.depDelaySum += +d; s.depDelayN++; }
    if (f[col.DepDel15] === '1.00' || +f[col.DepDel15] === 1) s.del15++;
    const t = f[col.TaxiOut];
    if (t !== '') { s.taxiOutSum += +t; s.taxiOutN++; }
  }
  s.nasDelaySum += +f[col.NASDelay] || 0;
  s.weatherDelaySum += +f[col.WeatherDelay] || 0;
  s.carrierDelaySum += +f[col.CarrierDelay] || 0;
  s.lateAircraftDelaySum += +f[col.LateAircraftDelay] || 0;
}

const pct = (a, b) => (b ? +(100 * a / b).toFixed(2) : null);
const avg = (a, b) => (b ? +(a / b).toFixed(2) : null);

const out = [...agg.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([airport, s]) => ({
    airport,
    city: s.city,
    state: s.state,
    sufficientSample: s.flights >= MIN_DEPARTURES,
    minDeparturesThreshold: MIN_DEPARTURES,
    period: `${year}-${String(month).padStart(2, '0')}`,
    scope: 'US domestic, BTS reporting carriers only',
    departures: s.flights,
    avgDepartureDelayMinutes: avg(s.depDelaySum, s.depDelayN),
    pctDelayedOver15: pct(s.del15, s.depDelayN),
    cancellationRatePct: pct(s.cancelled, s.flights),
    diversionRatePct: pct(s.diverted, s.flights),
    avgTaxiOutMinutes: avg(s.taxiOutSum, s.taxiOutN),
    nasDelayMinutesPerDeparture: avg(s.nasDelaySum, s.flights),
    weatherDelayMinutesPerDeparture: avg(s.weatherDelaySum, s.flights),
    carrierDelayMinutesPerDeparture: avg(s.carrierDelaySum, s.flights),
    lateAircraftDelayMinutesPerDeparture: avg(s.lateAircraftDelaySum, s.flights),
    avgStageLengthMiles: avg(s.distanceSum, s.flights),
    longHaulDepartures: s.longHaul,
    longHaulSharePct: pct(s.longHaul, s.flights),
    longHaulThresholdMiles: LONG_HAUL_MILES,
  }));

mkdirSync('data/out', { recursive: true });
writeFileSync(`data/out/ontime-${year}-${month}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
