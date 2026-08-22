import assert from 'node:assert/strict';
import test from 'node:test';
import { normalize, rawUnmetDemand } from '../scripts/lib/scoring.mjs';

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
