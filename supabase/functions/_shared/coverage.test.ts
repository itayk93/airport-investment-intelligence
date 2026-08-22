import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { describeCongestionCoverage } from './coverage.ts';

// Regression guard for the bug the refresh cron introduced: the coverage sentence was
// hardcoded prose, so the first scheduled run made the agent and the panel state a period
// that was no longer true. These lock the sentence to the data.

Deno.test('describes the real shape of a multi-month range', () => {
  assertEquals(
    describeCongestionCoverage([
      { data_scope: 't100_all', first_period: 202501, last_period: 202512, months: 12 },
      { data_scope: 'domestic_ontime', first_period: 202506, last_period: 202606, months: 13 },
    ]),
    '13 months of congestion data (June 2025 - June 2026)',
  );
});

Deno.test('month 12 and month 1 land on the right names', () => {
  assertEquals(
    describeCongestionCoverage([
      { data_scope: 'domestic_ontime', first_period: 202412, last_period: 202601, months: 14 },
    ]),
    '14 months of congestion data (December 2024 - January 2026)',
  );
});

Deno.test('a single month is not pluralised and is not shown as a range', () => {
  assertEquals(
    describeCongestionCoverage([
      { data_scope: 'domestic_ontime', first_period: 202605, last_period: 202605, months: 1 },
    ]),
    '1 month of congestion data (May 2026)',
  );
});

Deno.test('missing congestion data says so instead of inventing a period', () => {
  assertEquals(
    describeCongestionCoverage([
      { data_scope: 't100_all', first_period: 202501, last_period: 202512, months: 12 },
    ]),
    'Congestion coverage is unavailable',
  );
});
