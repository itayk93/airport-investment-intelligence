import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { asMetricNames, metricNames, parsePeriod, unknownMetricNames } from './dataCatalog.ts';

Deno.test('metric discovery exposes a broad stable catalog', () => {
  const names = metricNames();
  assertEquals(names.includes('long_haul_share_pct'), true);
  assertEquals(names.includes('cancellation_rate_pct'), true);
  assertEquals(names.includes('forecast_enplanements'), true);
});

Deno.test('metric input is allowlisted, deduplicated, and unknown names are reported', () => {
  const input = ['passengers', 'made_up_metric', 'passengers', 42];
  assertEquals(asMetricNames(input), ['passengers']);
  assertEquals(unknownMetricNames(input), ['made_up_metric']);
});

Deno.test('period parser accepts years and months and rejects malformed ranges', () => {
  assertEquals(parsePeriod('2026-05'), 202605);
  assertEquals(parsePeriod('2026'), 202601);
  assertEquals(parsePeriod('2026', true), 202612);
  assertEquals(parsePeriod('2026-13'), undefined);
});
