// Contracts shared between the UI and the two edge functions.
//
// Numeric columns arrive from PostgREST/postgres.js as strings (Postgres `numeric` has more
// precision than JS numbers, so the driver refuses to lossily coerce). `num()` is the single
// place that conversion happens — no component parses a raw field itself.

export type Nullable<T> = T | null;

export interface ScoreRow {
  iata_code: string;
  name: string;
  city: Nullable<string>;
  state: Nullable<string>;
  region: Nullable<string>;
  /** The regional peer group this row was ranked within. Scores only compare inside it. */
  comparison_set_id: Nullable<string>;
  capacity_pressure: Nullable<string | number>;
  forecast_growth_gap_pct: Nullable<string | number>;
  unmet_demand_score: Nullable<string | number>;
  long_haul_share_pct: Nullable<string | number>;
  expansion_score: Nullable<string | number>;
}

export interface WeightRow {
  key: string;
  label: string;
  source: string;
  weight: number;
}

export interface Caveat {
  tag: string;
  text: string;
}

export interface CoverageRow {
  data_scope: string;
  first_period: number;
  last_period: number;
  rows: string | number;
}

export interface ScoringModel {
  comparison_sets: string[];
  capacity_pressure_weights: WeightRow[];
  expansion_weights: WeightRow[];
  caveats: Caveat[];
}

export interface AirportDataResponse {
  scores: ScoreRow[];
  covered_airport_count: number;
  coverage: CoverageRow[];
  model: ScoringModel;
}

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

export interface ChatResponse {
  reply: string;
  tool_trace?: ToolCall[];
  budget_exhausted?: boolean;
}

/** Postgres numerics arrive as strings; convert in exactly one place. */
export function num(value: Nullable<string | number>): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}
