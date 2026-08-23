/// <reference lib="deno.ns" />
import { focusRegionFrom } from './focusRegion.ts';
import type { ScoreRow, ToolCall } from '../api/types.ts';

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
}

const row = (iata_code: string, state: string, comparison_set_id: string): ScoreRow => ({
  iata_code,
  name: iata_code,
  city: null,
  state,
  region: comparison_set_id,
  comparison_set_id,
  capacity_pressure: null,
  forecast_growth_gap_pct: null,
  unmet_demand_score: null,
  long_haul_share_pct: null,
  expansion_score: null,
});

const SCORES = [
  row('LAX', 'CA', 'Pacific'),
  row('SNA', 'CA', 'Pacific'),
  row('SFO', 'CA', 'Pacific'),
  row('BTV', 'VT', 'New England'),
  row('BOS', 'MA', 'New England'),
];

const call = (tool: string, args: Record<string, unknown>): ToolCall => ({ tool, args });

Deno.test('follows the airports the agent looked up', () => {
  assertEquals(focusRegionFrom([call('get_airport_data', { airports: ['LAX', 'SNA'] })], SCORES), 'Pacific');
});

Deno.test('resolves a region filter by name and by state', () => {
  assertEquals(focusRegionFrom([call('list_airports', { region: 'new england' })], SCORES), 'New England');
  assertEquals(focusRegionFrom([call('list_airports', { region: 'MA' })], SCORES), 'New England');
});

Deno.test('a cross-region comparison picks the region it is mostly about', () => {
  // The panel can only show one ranking, so the question's centre of gravity wins.
  assertEquals(
    focusRegionFrom([call('get_airport_data', { airports: ['LAX', 'SFO', 'BOS'] })], SCORES),
    'Pacific',
  );
});

Deno.test('an even split leaves the panel alone rather than guessing', () => {
  assertEquals(focusRegionFrom([call('get_airport_data', { airports: ['LAX', 'BOS'] })], SCORES), null);
});

Deno.test('unknown codes and empty traces change nothing', () => {
  assertEquals(focusRegionFrom([call('get_airport_data', { airports: ['ZZZ'] })], SCORES), null);
  assertEquals(focusRegionFrom([], SCORES), null);
  assertEquals(focusRegionFrom([call('list_airports', {})], []), null);
});
