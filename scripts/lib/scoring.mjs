/** Min-max normalizer for a comparison set. Nulls remain null. */
export function normalize(values) {
  const nums = values.filter((value) => value != null);
  if (!nums.length) return () => null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return (value) =>
    value == null ? null : max === min ? 0.5 : +((value - min) / (max - min)).toFixed(4);
}

/**
 * Demand cannot be "unmet" when forecast growth is non-positive or present-day
 * capacity pressure is zero. Clamp the growth gap before applying the pressure gate.
 */
export function rawUnmetDemand(forecastGrowthGapPct, capacityPressure) {
  return +(Math.max(0, forecastGrowthGapPct) * Math.max(0, capacityPressure)).toFixed(4);
}

/** Index rows once by a key instead of repeatedly filtering the full input per entity. */
export function groupBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const value = row[key];
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(row);
  }
  return groups;
}
