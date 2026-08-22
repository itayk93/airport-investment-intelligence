// The ONLY way the agent reaches the database.
//
// Deliberately NOT a "run this SQL" tool. Every tool takes typed parameters and delegates
// to a parameterized query in _shared/db.ts, so there is no free-form SQL surface for the
// model to write into — and therefore no injection path to validate against. Combined with
// the SELECT-only `agent_reader` role, that is defense in depth: even a fully compromised
// prompt cannot write, drop, or read outside these four tables.
//
// Each result carries a `note` restating that data's scope caveat, so the caveat travels
// with the data into the model's context instead of relying on the system prompt alone.
import {
  asIataCodes,
  COMPARISON_SET,
  getForecast,
  getMetrics,
  getScores,
  listAirports,
} from '../_shared/db.ts';

export const toolDefinitions = [
  {
    type: 'function' as const,
    function: {
      name: 'list_airports',
      description:
        'List the airports available in the dataset with city, state, and region tag. Use this to resolve place names ("New England", "Santa Ana", "LA") to IATA codes, and to tell the user honestly what coverage exists.',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_airport_scores',
      description:
        'Get the deterministic investment scores (capacity pressure, forecast growth gap, unmet demand, expansion score, long-haul share) for specific airports, or for all airports ranked by expansion score. Use for ranking, comparison, and "which airport is the best candidate" questions.',
      parameters: {
        type: 'object',
        properties: {
          airports: {
            type: 'array',
            items: { type: 'string' },
            description: 'IATA codes, e.g. ["SFO","LAX"]. Omit for all airports ranked.',
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_airport_metrics',
      description:
        'Get the raw monthly operational metrics behind the scores — departure delay, taxi-out, cancellation rate, NAS/weather/carrier delay per departure, long-haul departures, passengers, seats. Use when asked about congestion detail, delays, long-haul percentages, or for the evidence behind a score.',
      parameters: {
        type: 'object',
        properties: {
          airports: { type: 'array', items: { type: 'string' }, description: 'IATA codes.' },
          data_scope: {
            type: 'string',
            enum: ['domestic_ontime', 't100_all'],
            description:
              'domestic_ontime = US domestic congestion/delay (BTS On-Time). t100_all = passenger/seat volume including international (BTS T-100). Default domestic_ontime.',
          },
        },
        required: ['airports'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_airport_forecast',
      description:
        'Get FAA Terminal Area Forecast enplanements and operations by year. scenario 0 = historical actual, 1 = forecast. Use for future-growth questions.',
      parameters: {
        type: 'object',
        properties: {
          airports: { type: 'array', items: { type: 'string' } },
          from_year: { type: 'integer', description: 'First year, inclusive.' },
          to_year: { type: 'integer', description: 'Last year, inclusive.' },
        },
        required: ['airports', 'from_year', 'to_year'],
        additionalProperties: false,
      },
    },
  },
];

const SCORE_NOTE =
  'Scores are relative to this comparison set only, not an absolute industry scale. Weights are a stated assumption, not an industry standard.';

export async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'list_airports':
      return { rows: await listAirports() };

    case 'get_airport_scores':
      return {
        comparison_set: COMPARISON_SET,
        note: SCORE_NOTE,
        rows: await getScores(asIataCodes(args.airports)),
      };

    case 'get_airport_metrics': {
      const codes = asIataCodes(args.airports);
      if (!codes.length) return { error: 'No valid IATA codes provided.' };
      const scope = args.data_scope === 't100_all' ? 't100_all' : 'domestic_ontime';
      return {
        data_scope: scope,
        note:
          scope === 'domestic_ontime'
            ? 'US domestic flights by BTS reporting carriers only — international departures are NOT included.'
            : 'BTS T-100, includes both domestic and international traffic.',
        rows: await getMetrics(codes, scope),
      };
    }

    case 'get_airport_forecast': {
      const codes = asIataCodes(args.airports);
      if (!codes.length) return { error: 'No valid IATA codes provided.' };
      return {
        note:
          'FAA Terminal Area Forecast (2025 vintage). scenario 0 = historical actual (through FY2024), scenario 1 = forecast.',
        rows: await getForecast(codes, Number(args.from_year) || 2019, Number(args.to_year) || 2035),
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
