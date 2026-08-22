// Fetches BTS T-100 at MONTHLY grain (not the annual roll-up used in the stage-1 spike
// output test-bts-t100.mjs produced) — airport_metrics_monthly needs one row per
// (airport, year, month), and the spike's data/out/t100-2025.json is an annual sum that
// cannot satisfy that grain. Same verified source/endpoint as stage 1, just grouped by
// month instead of by year.
const BASE = 'https://data.bts.gov/resource/r495-tyji.json';
const AIRPORTS = ['SFO', 'LAX', 'SNA', 'ANC', 'BOS'];

export async function fetchT100Monthly(year) {
  const url =
    `${BASE}?` +
    new URLSearchParams({
      $select: [
        'origin_airport_code',
        'year',
        'date_extract_m(reporting_month) as month',
        'sum(total_departures) as departures',
        'sum(total_passengers) as passengers',
        'sum(total_seats) as seats',
        'sum(domestic_departures) as domestic_departures',
      ].join(','),
      $where: `origin_airport_code in('${AIRPORTS.join("','")}') and year='${year}'`,
      $group: 'origin_airport_code,year,month',
      $order: 'origin_airport_code,month',
    });

  const res = await fetch(url);
  if (!res.ok) throw new Error(`BTS T-100 monthly fetch failed: ${res.status}`);
  const rows = await res.json();

  return rows.map((r) => {
    const passengers = +r.passengers, seats = +r.seats;
    return {
      iata_code: r.origin_airport_code,
      year: +r.year,
      month: +r.month,
      data_scope: 't100_all',
      departures: +r.departures,
      passengers,
      seats,
      load_factor_pct: seats ? +(100 * passengers / seats).toFixed(2) : null,
      domestic_departures: +r.domestic_departures,
    };
  });
}
