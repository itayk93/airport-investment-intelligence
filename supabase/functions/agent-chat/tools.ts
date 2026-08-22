// Generic, allowlisted data access for the agent. The model selects fields, never SQL.
import {
  asIataCodes,
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

// Above this, an unfiltered list_airports result no longer fits the agent's tool-result
// budget; see the note branch in runTool.
const MAX_AIRPORT_ROWS = 60;

export const toolDefinitions = [
  {
    type: 'function' as const,
    function: {
      name: 'list_airports',
      description:
        'Discover which airports are covered, resolve city/state/region names to IATA codes, AND rank a region. Each row carries the airport\'s scores (capacity_pressure, unmet_demand_score, forecast_growth_gap_pct, expansion_score) plus whether it is scored and which comparison set it belongs to; a covered airport can be unscored because its traffic is below the sample floor. THIS IS THE ONLY CORRECT WAY TO ANSWER "which airports in region X rank highest" — one call with a region returns every airport in that set with its scores, so you rank the complete set. Never assemble a ranking by passing a hand-picked list of codes to get_airport_data: that ranks whatever you happened to ask about, not the region. Use before claiming that a place is not covered.',
      parameters: {
        type: 'object',
        properties: {
          region: {
            type: 'string',
            description:
              'Optional case-insensitive region or state filter, for example "New England" or "MA".',
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
  // asIataCodes caps the list. Dropping the overflow silently is how a partial answer gets
  // presented as a complete ranking: ask for 31 Pacific airports, get 20 back, and rank
  // those as if they were the region. The overflow is reported so the model can say the
  // list was cut instead of quietly ranking a subset.
  const requestedCount = Array.isArray(args.airports) ? args.airports.length : 0;
  const droppedForLimit = Math.max(0, requestedCount - airports.length);
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
  let scoreRows: DataRow[] = [];
  if (scoreMetrics.length) {
    scoreRows = await getScores(airports) as unknown as DataRow[];
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
    // One set name no longer covers the answer: each score row carries the regional set it
    // was ranked in, and a multi-airport request can legitimately span several.
    comparison_sets: scoreMetrics.length
      ? [...new Set(scoreRows.map((r) => r.comparison_set_id).filter(Boolean))]
      : undefined,
    metric_metadata: catalog(metrics),
    // Present only when the request exceeded the per-call airport cap, so a truncated
    // result can never be mistaken for the full set.
    airports_dropped_over_limit: droppedForLimit || undefined,
    incomplete_result_warning: droppedForLimit
      ? `Only the first ${airports.length} airports were queried; ${droppedForLimit} were dropped. This result is NOT the full set — do not present it as a regional ranking. Use list_airports, which returns scores for every airport in a region in one call.`
      : undefined,
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

/**
 * Trim an airport row to what the model can actually use.
 *
 * Two jobs. Size: a region's rows plus the metric catalog overflowed the tool-result byte
 * budget once scores were added here, and a truncated result reaches the model as broken
 * JSON. Honesty: scores are rounded to two decimals at the source rather than asking the
 * model to round in prose. The fourth decimal of a modeled proxy is noise, and a number
 * that is never produced cannot be quoted.
 */
function compactAirportRow(row: DataRow): DataRow {
  const round = (v: unknown) => (v === null || v === undefined ? undefined : Number(Number(v).toFixed(2)));
  const out: DataRow = {
    iata_code: row.iata_code,
    name: row.name,
    state: row.state,
    region: row.region,
    scored: row.scored,
  };
  if (row.scored) {
    out.comparison_set_id = row.comparison_set_id;
    out.capacity_pressure = round(row.capacity_pressure);
    out.unmet_demand_score = round(row.unmet_demand_score);
    out.forecast_growth_gap_pct = round(row.forecast_growth_gap_pct);
    out.expansion_score = round(row.expansion_score);
  } else if (row.score_exclusion_reason) {
    out.score_exclusion_reason = row.score_exclusion_reason;
  }
  return out;
}

export async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'list_airports': {
      const all = await listAirports() as unknown as DataRow[];
      const filter = typeof args.region === 'string' ? args.region.trim().toLowerCase() : '';
      const matched = filter
        ? all.filter((r) =>
          String(r.region ?? '').toLowerCase() === filter ||
          String(r.state ?? '').toLowerCase() === filter
        )
        : all;
      // Scored airports first, best expansion score first, then the unscored tail. Two
      // reasons: the answer to "who ranks highest here" is then the top of the array, and
      // if the result ever is truncated it loses unrankable airports rather than the
      // ranking itself. Degrading into a shorter correct list beats degrading into a
      // wrong one.
      const rows = [...matched]
        .sort((a, b) => {
          if (a.scored !== b.scored) return a.scored ? -1 : 1;
          if (!a.scored) return String(a.iata_code).localeCompare(String(b.iata_code));
          return Number(b.expansion_score ?? 0) - Number(a.expansion_score ?? 0);
        })
        .map(compactAirportRow);
      const summary = {
        // Reported explicitly so an empty filtered result reads as "no match in a known
        // region list" rather than as "coverage is empty".
        total_airports_covered: all.length,
        scored_airports: all.filter((r) => r.scored).length,
        regions: [...new Set(all.map((r) => r.region).filter(Boolean))].sort(),
        // The metric dictionary is for discovery. A region-filtered call is a ranking
        // request, and the rows already carry the scores, so sending several KB of catalog
        // alongside them pushes the result past the tool-result byte budget — which
        // truncates the JSON and leaves the model with nothing usable.
        available_metrics: filter ? undefined : catalog(),
      };
      // An unfiltered dump of every covered airport exceeds the tool-result byte budget and
      // comes back to the model as a truncated JSON fragment — worse than no rows at all.
      // Return the directory instead and make the model narrow the request.
      if (!filter && all.length > MAX_AIRPORT_ROWS) {
        return {
          ...summary,
          rows: [],
          note:
            `Coverage is ${all.length} airports, too many to list at once. Call list_airports again with a region from the regions field, or with a two-letter state code.`,
        };
      }
      return { rows, ...summary };
    }
    case 'get_airport_data':
      return getAirportData(args);
    default:
      return {
        error: `Unknown tool: ${name}`,
        available_tools: ['list_airports', 'get_airport_data'],
      };
  }
}
