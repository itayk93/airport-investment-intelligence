// Generic, allowlisted data access for the agent. The model selects fields, never SQL.
import {
  asIataCodes,
  COMPARISON_SET,
  getForecast,
  getMetrics,
  getScores,
  listAirports,
} from '../_shared/db.ts';
import {
  asMetricNames,
  METRIC_CATALOG,
  metricNames,
  parsePeriod,
  type DataScope,
  type MetricName,
  unknownMetricNames,
} from './dataCatalog.ts';

export const toolDefinitions = [
  {
    type: 'function' as const,
    function: {
      name: 'list_airports',
      description:
        'Discover which airports are covered and resolve city, state, or region names to IATA codes. Use before claiming that a place is not covered.',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_airport_data',
      description:
        'General airport data tool. Request any allowlisted metrics for airports and an optional period/scope. Call with an empty metrics array to discover the data dictionary. If a metric is unavailable, inspect available_metrics before answering.',
      parameters: {
        type: 'object',
        properties: {
          airports: {
            type: 'array',
            items: { type: 'string' },
            description: 'IATA codes, for example ["ANC","SFO"].',
          },
          metrics: {
            type: 'array',
            items: {
              type: 'string',
              enum: metricNames(),
            },
            description: 'Canonical metric names from the data dictionary.',
          },
          from: {
            type: 'string',
            description: 'Optional start period as YYYY or YYYY-MM.',
          },
          to: {
            type: 'string',
            description: 'Optional end period as YYYY or YYYY-MM.',
          },
          scope: {
            type: 'string',
            enum: ['domestic_ontime', 't100_all'],
            description: 'Optional source scope. Omit to let metric metadata select valid scopes.',
          },
        },
        required: ['airports', 'metrics'],
        additionalProperties: false,
      },
    },
  },
];

type DataRow = Record<string, unknown>;

function catalog(names: MetricName[] = metricNames()) {
  return Object.fromEntries(names.map((name) => [name, METRIC_CATALOG[name]]));
}

function pick(row: DataRow, metrics: MetricName[], extra: string[]): DataRow {
  return Object.fromEntries(
    [...extra, ...metrics.map((name) => METRIC_CATALOG[name].field)]
      .filter((field, index, fields) => fields.indexOf(field) === index)
      .map((field) => [field, row[field]]),
  );
}

function scopesFor(metric: MetricName, requested?: DataScope): DataScope[] {
  const definition = METRIC_CATALOG[metric];
  if (definition.source !== 'monthly') return [];
  const supported = [...definition.scopes];
  return requested ? supported.filter((scope) => scope === requested) : supported;
}

async function getAirportData(args: Record<string, unknown>): Promise<unknown> {
  const airports = asIataCodes(args.airports);
  const metrics = asMetricNames(args.metrics);
  const unknown = unknownMetricNames(args.metrics);
  const requestedScope = args.scope === 'domestic_ontime' || args.scope === 't100_all'
    ? args.scope
    : undefined;

  if (!metrics.length) {
    return {
      error: unknown.length ? 'No requested metric is available.' : 'Choose one or more metrics.',
      unknown_metrics: unknown,
      available_metrics: catalog(),
    };
  }
  if (!airports.length) {
    return {
      error: 'No valid IATA airport codes were provided. Use list_airports for discovery.',
      available_metrics: catalog(metrics),
    };
  }

  const from = parsePeriod(args.from);
  const to = parsePeriod(args.to, true);
  if ((args.from !== undefined && !from) || (args.to !== undefined && !to) || (from && to && from > to)) {
    return {
      error: 'Invalid period. Use YYYY or YYYY-MM and keep from before to.',
      available_metrics: catalog(metrics),
    };
  }

  const rows: DataRow[] = [];
  const unavailable = new Set<string>(unknown);
  const scoreMetrics = metrics.filter((name) => METRIC_CATALOG[name].source === 'scores');
  if (scoreMetrics.length) {
    const scoreRows = await getScores(airports) as unknown as DataRow[];
    rows.push(...scoreRows.map((row) => ({
      source: 'computed_scores',
      ...pick(row, scoreMetrics, ['iata_code', 'name', 'computed_at']),
    })));
  }

  const monthlyMetrics = metrics.filter((name) => METRIC_CATALOG[name].source === 'monthly');
  for (const scope of ['domestic_ontime', 't100_all'] as const) {
    const scopedMetrics = monthlyMetrics.filter((name) => scopesFor(name, requestedScope).includes(scope));
    if (!scopedMetrics.length) continue;
    const monthlyRows = await getMetrics(airports, scope, from, to) as unknown as DataRow[];
    rows.push(...monthlyRows.map((row) => ({
      source: scope === 'domestic_ontime' ? 'BTS On-Time' : 'BTS T-100',
      ...pick(row, scopedMetrics, ['iata_code', 'year', 'month', 'data_scope']),
    })));
  }
  for (const metric of monthlyMetrics) {
    if (!scopesFor(metric, requestedScope).length) unavailable.add(metric);
  }

  const forecastMetrics = metrics.filter((name) => METRIC_CATALOG[name].source === 'forecast');
  if (forecastMetrics.length) {
    const fromYear = from ? Math.floor(from / 100) : 2019;
    const toYear = to ? Math.floor(to / 100) : 2035;
    const forecastRows = await getForecast(airports, fromYear, toYear) as unknown as DataRow[];
    rows.push(...forecastRows.map((row) => ({
      source: 'FAA TAF 2025',
      ...pick(row, forecastMetrics, ['iata_code', 'year', 'scenario']),
    })));
  }

  return {
    comparison_set: scoreMetrics.length ? COMPARISON_SET : undefined,
    metric_metadata: catalog(metrics),
    rows,
    unavailable_metrics: [...unavailable],
    available_metrics: unavailable.size ? catalog() : undefined,
    notes: [
      'scenario 0 is FAA historical actual; scenario 1 is FAA forecast.',
      'domestic_ontime covers US domestic flights by BTS reporting carriers.',
      't100_all includes domestic and international traffic volume.',
      'Long-haul means at least 2,000 miles and is a project-defined threshold.',
    ],
  };
}

export async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'list_airports':
      return { rows: await listAirports() };
    case 'get_airport_data':
      return getAirportData(args);
    default:
      return {
        error: `Unknown tool: ${name}`,
        available_tools: ['list_airports', 'get_airport_data'],
      };
  }
}
