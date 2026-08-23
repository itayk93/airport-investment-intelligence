// Which regional ranking the analysis panel should be showing, derived from what the agent
// just looked up.
//
// The panel is the deterministic half of the answer, so it is only useful when it is
// showing the same peer group the prose is talking about. Leaving that to a dropdown meant
// the panel could sit on New England while the answer discussed the Pacific — and it made
// the strongest thing about the two-pane design (same numbers, two independent paths)
// invisible unless someone knew to go looking for it. WhatsApp has no panel and no
// dropdown at all, which is the same point from the other side: the region has to come
// from the question, not from the reader.
import type { ScoreRow, ToolCall } from '../api/types';

/**
 * Returns the comparison set the last tool calls were about, or null when that is
 * ambiguous or unknown — in which case the caller leaves the panel where it is rather than
 * guessing.
 */
export function focusRegionFrom(trace: ToolCall[], scores: ScoreRow[]): string | null {
  if (!trace.length || !scores.length) return null;

  const regionOfCode = new Map<string, string>();
  const regionNames = new Set<string>();
  const regionOfState = new Map<string, string>();
  for (const row of scores) {
    if (!row.comparison_set_id) continue;
    regionOfCode.set(row.iata_code.toUpperCase(), row.comparison_set_id);
    regionNames.add(row.comparison_set_id);
    if (row.state) regionOfState.set(row.state.trim().toUpperCase(), row.comparison_set_id);
  }

  // Count rather than take the first: "compare LAX and BOS" spans two regions and the panel
  // can only show one, so the region the question is mostly about wins, and a genuine tie
  // returns null instead of picking arbitrarily.
  const hits = new Map<string, number>();
  const count = (region: string | undefined) => {
    if (region) hits.set(region, (hits.get(region) ?? 0) + 1);
  };

  for (const call of trace) {
    const args = (call.args ?? {}) as { airports?: unknown; region?: unknown };
    if (Array.isArray(args.airports)) {
      for (const code of args.airports) {
        if (typeof code === 'string') count(regionOfCode.get(code.trim().toUpperCase()));
      }
    }
    // list_airports takes a free-text region filter, which may be a region name or a state.
    if (typeof args.region === 'string' && args.region.trim()) {
      const value = args.region.trim();
      const named = [...regionNames].find((name) => name.toLowerCase() === value.toLowerCase());
      count(named ?? regionOfState.get(value.toUpperCase()));
    }
  }

  if (!hits.size) return null;
  const ranked = [...hits].sort((a, b) => b[1] - a[1]);
  const [top, runnerUp] = ranked;
  if (!top) return null;
  if (runnerUp && runnerUp[1] === top[1]) return null;
  return top[0];
}
