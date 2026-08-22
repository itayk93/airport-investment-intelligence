// Proof-of-data: BTS T-100 Segment Summary By Origin Airport (Socrata, no API key).
// Usage: node scripts/test-bts-t100.mjs [YEAR]
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = 'https://data.bts.gov/resource/r495-tyji.json';
const AIRPORTS = ['SFO', 'LAX', 'SNA', 'ANC', 'BOS'];
const year = process.argv[2] ?? '2025';

const soql = (params) =>
  BASE + '?' + Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

const url = soql({
  '$select': [
    'origin_airport_code',
    'sum(total_departures) as departures',
    'sum(total_passengers) as passengers',
    'sum(total_seats) as seats',
    'sum(domestic_departures) as domestic_departures',
    'count(*) as months',
  ].join(','),
  '$where': `origin_airport_code in('${AIRPORTS.join("','")}') and year='${year}'`,
  '$group': 'origin_airport_code',
  '$order': 'origin_airport_code',
});

const rows = await fetch(url).then((r) => {
  if (!r.ok) throw new Error(`BTS T-100 ${r.status}`);
  return r.json();
});

const out = rows.map((r) => {
  const deps = +r.departures, pax = +r.passengers, seats = +r.seats;
  return {
    airport: r.origin_airport_code,
    year,
    monthsCovered: +r.months,
    departures: deps,
    passengers: pax,
    seats,
    loadFactorPct: +(100 * pax / seats).toFixed(1),
    paxPerDeparture: +(pax / deps).toFixed(1),
    internationalDeparturesShare: +(100 * (1 - +r.domestic_departures / deps)).toFixed(1),
  };
});

mkdirSync('data/out', { recursive: true });
writeFileSync(`data/out/t100-${year}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
