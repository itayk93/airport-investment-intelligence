import assert from 'node:assert/strict';
import test from 'node:test';
import { groupBy, normalize, rawUnmetDemand } from '../scripts/lib/scoring.mjs';
import { regionForState, REGIONS } from '../scripts/lib/regions.mjs';

test('zero capacity pressure produces zero unmet demand', () => {
  assert.equal(rawUnmetDemand(2.5, 0), 0);
});

test('negative growth gap produces zero unmet demand', () => {
  assert.equal(rawUnmetDemand(-0.91, 0.63), 0);
});

test('positive growth at a pressured airport is gated by pressure', () => {
  assert.equal(rawUnmetDemand(1.152, 0.4612), 0.5313);
});

test('normalization keeps zero at the floor when raw unmet demand is non-negative', () => {
  const values = [2.07, 0.5313, 0, 0.0647, 0];
  const norm = normalize(values);
  assert.equal(norm(0), 0);
  assert.equal(norm(2.07), 1);
});

test('groupBy indexes rows without losing order or missing-key groups', () => {
  const rows = [
    { iata_code: 'SFO', month: 1 },
    { iata_code: 'LAX', month: 1 },
    { iata_code: 'SFO', month: 2 },
  ];
  const grouped = groupBy(rows, 'iata_code');
  assert.deepEqual(grouped.get('SFO'), [rows[0], rows[2]]);
  assert.deepEqual(grouped.get('LAX'), [rows[1]]);
  assert.equal(grouped.get('BOS'), undefined);
});

// --- Regional comparison sets (stage 14) ---

test('New England maps to exactly the six Census-division states', () => {
  const inNewEngland = ['CT', 'ME', 'MA', 'NH', 'RI', 'VT'];
  for (const s of inNewEngland) assert.equal(regionForState(s), 'New England');
  // NY is Middle Atlantic, not New England — regional questions depend on this
  // boundary being the published one rather than a colloquial guess.
  assert.equal(regionForState('NY'), 'Middle Atlantic');
});

test('territories get their own set and unknown states get none', () => {
  assert.equal(regionForState('PR'), 'US Territories');
  assert.equal(regionForState('ZZ'), null);
  assert.equal(regionForState(null), null);
});

test('every state maps to exactly one region', () => {
  const seen = new Map();
  for (const region of REGIONS) {
    for (const state of ['CA', 'MA', 'TX', 'NY', 'AK', 'HI', 'PR']) {
      if (regionForState(state) === region) {
        assert.ok(!seen.has(state), `${state} appears in more than one region`);
        seen.set(state, region);
      }
    }
  }
  assert.equal(seen.size, 7);
});
