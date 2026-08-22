export type DataSource = 'scores' | 'monthly' | 'forecast';
export type DataScope = 'domestic_ontime' | 't100_all';

export interface MetricDefinition {
  source: DataSource;
  field: string;
  unit: string;
  description: string;
  scopes?: DataScope[];
}

export const METRIC_CATALOG = {
  capacity_pressure: { source: 'scores', field: 'capacity_pressure', unit: 'score_0_to_1', description: 'Relative congestion proxy.' },
  forecast_growth_gap_pct: { source: 'scores', field: 'forecast_growth_gap_pct', unit: 'percentage_points', description: 'FAA forecast CAGR minus historical T-100 CAGR. Positive means the FAA expects growth FASTER than the airport\'s own measured 2014-2024 trend; negative means the FAA expects it to SLOW DOWN relative to that trend. Never describe a negative value as growth outpacing the forecast.' },
  unmet_demand_score: { source: 'scores', field: 'unmet_demand_score', unit: 'score_0_to_1', description: 'Pressure-gated forecast growth gap.' },
  expansion_score: { source: 'scores', field: 'expansion_score', unit: 'score_0_to_1', description: 'Composite modernization screening score.' },
  long_haul_share_pct: { source: 'monthly', field: 'long_haul_share_pct', unit: 'percent', description: 'Share of sampled departures flying at least 2,000 miles.', scopes: ['domestic_ontime'] },
  departures: { source: 'monthly', field: 'departures', unit: 'departures', description: 'Monthly departures.', scopes: ['domestic_ontime', 't100_all'] },
  passengers: { source: 'monthly', field: 'passengers', unit: 'passengers', description: 'Monthly passengers.', scopes: ['t100_all'] },
  seats: { source: 'monthly', field: 'seats', unit: 'seats', description: 'Monthly available seats.', scopes: ['t100_all'] },
  load_factor_pct: { source: 'monthly', field: 'load_factor_pct', unit: 'percent', description: 'Passenger load factor.', scopes: ['t100_all'] },
  avg_dep_delay_minutes: { source: 'monthly', field: 'avg_dep_delay_minutes', unit: 'minutes_per_departure', description: 'Average departure delay.', scopes: ['domestic_ontime'] },
  pct_delayed_over_15: { source: 'monthly', field: 'pct_delayed_over_15', unit: 'percent', description: 'Share delayed more than 15 minutes.', scopes: ['domestic_ontime'] },
  cancellation_rate_pct: { source: 'monthly', field: 'cancellation_rate_pct', unit: 'percent', description: 'Cancellation rate.', scopes: ['domestic_ontime'] },
  diversion_rate_pct: { source: 'monthly', field: 'diversion_rate_pct', unit: 'percent', description: 'Diversion rate.', scopes: ['domestic_ontime'] },
  avg_taxi_out_minutes: { source: 'monthly', field: 'avg_taxi_out_minutes', unit: 'minutes_per_departure', description: 'Average taxi-out time.', scopes: ['domestic_ontime'] },
  nas_delay_min_per_dep: { source: 'monthly', field: 'nas_delay_min_per_dep', unit: 'minutes_per_departure', description: 'National Airspace System delay.', scopes: ['domestic_ontime'] },
  weather_delay_min_per_dep: { source: 'monthly', field: 'weather_delay_min_per_dep', unit: 'minutes_per_departure', description: 'Weather delay.', scopes: ['domestic_ontime'] },
  carrier_delay_min_per_dep: { source: 'monthly', field: 'carrier_delay_min_per_dep', unit: 'minutes_per_departure', description: 'Carrier delay.', scopes: ['domestic_ontime'] },
  late_aircraft_delay_min_per_dep: { source: 'monthly', field: 'late_aircraft_delay_min_per_dep', unit: 'minutes_per_departure', description: 'Late-arriving-aircraft delay.', scopes: ['domestic_ontime'] },
  avg_stage_length_miles: { source: 'monthly', field: 'avg_stage_length_miles', unit: 'miles', description: 'Average flight distance.', scopes: ['domestic_ontime'] },
  long_haul_departures: { source: 'monthly', field: 'long_haul_departures', unit: 'departures', description: 'Departures flying at least 2,000 miles.', scopes: ['domestic_ontime'] },
  forecast_enplanements: { source: 'forecast', field: 'enplanements', unit: 'passengers', description: 'FAA TAF annual enplanements.' },
  forecast_operations: { source: 'forecast', field: 'operations', unit: 'operations', description: 'FAA TAF annual operations.' },
} as const satisfies Record<string, MetricDefinition>;

export type MetricName = keyof typeof METRIC_CATALOG;

export function metricNames(): MetricName[] {
  return Object.keys(METRIC_CATALOG) as MetricName[];
}

export function asMetricNames(value: unknown, limit = 12): MetricName[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is MetricName =>
    typeof item === 'string' && item in METRIC_CATALOG
  ))].slice(0, limit);
}

export function unknownMetricNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string =>
    typeof item === 'string' && !(item in METRIC_CATALOG)
  ))];
}

export function parsePeriod(value: unknown, end = false): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d{4})(?:-(0[1-9]|1[0-2]))?$/.exec(value.trim());
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : end ? 12 : 1;
  return year * 100 + month;
}
