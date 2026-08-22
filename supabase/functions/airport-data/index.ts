// Read-only data endpoint for the UI's analysis panel.
//
// Separate from agent-chat on purpose: the panel needs deterministic scores rendered
// exactly as computed, with no LLM in the path. Sharing _shared/db.ts means the panel and
// the agent can never disagree about a number — same query, one definition.
import { getAirportCount, getCoverage, getScores } from '../_shared/db.ts';
import { isAllowedOrigin, json, preflight } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  if (!isAllowedOrigin(req)) return json({ error: 'Origin not allowed' }, 403, req);
  if (req.method !== 'GET') return json({ error: 'GET only' }, 405, req);

  try {
    const [scores, coveredAirportCount, coverage] = await Promise.all([
      getScores(),
      getAirportCount(),
      getCoverage(),
    ]);

    return json({
      scores,
      covered_airport_count: coveredAirportCount,
      coverage,
      // The scoring model, served from the backend so the UI never hardcodes weights that
      // could drift from scripts/score.mjs.
      model: {
        // Every distinct regional set present in the current scores, derived rather than
        // hardcoded so the panel cannot advertise a set that scoring did not produce.
        comparison_sets: [...new Set(scores.map((r: { comparison_set_id?: string }) => r.comparison_set_id).filter(Boolean))].sort(),
        capacity_pressure_weights: [
          { key: 'taxiOut', label: 'Average taxi-out time', source: 'BTS On-Time · minutes per departure', weight: 0.4 },
          { key: 'nasDelay', label: 'NAS delay per departure', source: 'BTS On-Time · air-traffic-system minutes', weight: 0.35 },
          { key: 'pctDelayed15', label: 'Flights delayed >15 min', source: 'BTS On-Time · share of departures', weight: 0.25 },
        ],
        expansion_weights: [
          { key: 'unmetDemand', label: 'Unmet demand', source: 'growth gap × capacity pressure', weight: 0.5 },
          { key: 'forecastCagr', label: 'Forecast enplanement CAGR', source: 'FAA TAF · FY2024→FY2035', weight: 0.3 },
          { key: 'capacityPressure', label: 'Capacity pressure', source: 'current congestion index', weight: 0.2 },
        ],
        caveats: [
          { tag: '01', text: 'Weights are a chosen heuristic, not an industry standard. The FAA itself uses separate throughput, demand, and delay criteria rather than one weighted composite.' },
          { tag: '02', text: 'No public dataset publishes runway, gate, or terminal capacity. Capacity pressure and unmet demand are modeled proxies built from delay and forecast data.' },
          { tag: '03', text: 'Scores are relative to an airport\'s own US Census region, not national and not absolute. 1.00 means "most pressured in that region". Scores from different regions are not comparable — compare the underlying metrics instead.' },
          { tag: '06', text: 'Airports below 300 departures per month are covered but not scored: at that sample size a few disrupted days can move delay averages more than genuine congestion does.' },
          { tag: '04', text: 'Congestion data covers US domestic flights by BTS reporting carriers only. International departures at SFO and LAX are not in the delay figures.' },
          { tag: '05', text: 'The 2,000-mile long-haul threshold is our own definition, not a BTS or FAA standard.' },
        ],
      },
    }, 200, req);
  } catch (err) {
    console.error('airport-data error:', err);
    return json({ error: 'Unable to load airport data.' }, 500, req);
  }
});
