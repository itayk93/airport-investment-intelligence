// Scope classification. Runs before the model, so an out-of-scope request costs nothing.
//
// The vocabulary used to be a hand-written list that still carried the five pilot airport
// codes (sfo|lax|sna|anc|bos) from the original build. Coverage has since grown to every
// BTS origin airport, so a perfectly ordinary question — "how congested is MHT?" — matched
// nothing and was answered with "I only help with airport questions". The airport-specific
// half of the vocabulary is now built from the database (see buildScopeVocabulary) and
// passed in; the generic aviation terms below stay static because they do not change with
// coverage.
const AIRPORT_TERMS = /\b(airport|airports|airfield|aviation|flight|flights|passenger|passengers|departure|departures|landing|landings|runway|runways|terminal|terminals|gate|gates|congestion|delay|delays|cancellation|capacity|long[- ]haul|enplanement|taxi[- ]out|modernization|expansion|investment|faa|bts|taf|t-?100|new england|pacific northwest)\b/i;

// Requests for a different deliverable stay out of scope even when they mention an
// airport. This prevents prompts such as "write Python code for LAX landings" from
// slipping through a broad airport-keyword check.
const NON_ANALYSIS_TASKS = /\b(write|create|generate|build|make|show|give|provide|implement|debug|fix|refactor|translate|summarize)\b[\s\S]{0,80}\b(code|script|program|app|website|html|css|javascript|typescript|python|sql|regex|poem|story|email|resume|cover letter|image|logo)\b|\b(code|script|program)\b[\s\S]{0,40}\b(that|to|for)\b/i;

const SOCIAL_ONLY = /^(hi|hello|hey|thanks|thank you|help|what can you do)[.!?\s]*$/i;

// IATA codes that are also ordinary English words. Matching these case-insensitively would
// let almost any sentence through the scope gate — "and", "the", "one" are IATA codes for
// real US airports. They still match when written in capitals, which is how anyone actually
// referring to the airport writes it.
const AMBIGUOUS_CODES = new Set([
  'AND', 'ANY', 'ART', 'ATE', 'BAR', 'BED', 'BIG', 'BUS', 'CAR', 'CUT', 'DAY', 'EAR', 'EAT',
  'END', 'ERA', 'FAR', 'FIT', 'FLY', 'FOR', 'GAS', 'HOT', 'ICE', 'ILL', 'INK', 'JOB', 'LAW',
  'LOW', 'MAN', 'MAP', 'NET', 'NEW', 'NOT', 'NOW', 'OIL', 'OLD', 'ONE', 'OUR', 'OUT', 'OWN',
  'PAY', 'PER', 'PIT', 'POP', 'RED', 'RUN', 'SEA', 'SEE', 'SET', 'SIT', 'SKY', 'SON', 'SUN',
  'TAX', 'TEA', 'TEN', 'THE', 'TIP', 'TOO', 'TOP', 'TOY', 'TRY', 'TWO', 'USE', 'WAR', 'WAY',
  'WIN', 'WON', 'YES', 'YET', 'YOU',
]);

/** Escape a value for literal use inside a RegExp — city names contain dots and dashes. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface ScopeVocabularySource {
  iata_code?: unknown;
  city?: unknown;
  state?: unknown;
  region?: unknown;
}

/**
 * Build the airport-name vocabulary from the covered airports. Codes are matched
 * case-insensitively unless they are ordinary English words, in which case only the
 * capitalised form counts. Cities, states and regions are always case-insensitive.
 */
export function buildScopeVocabulary(rows: ScopeVocabularySource[]): RegExp | null {
  const anyCase = new Set<string>();
  const upperOnly = new Set<string>();
  for (const row of rows) {
    const code = typeof row.iata_code === 'string' ? row.iata_code.trim().toUpperCase() : '';
    if (/^[A-Z]{3}$/.test(code)) (AMBIGUOUS_CODES.has(code) ? upperOnly : anyCase).add(code);
    for (const field of [row.city, row.state, row.region]) {
      // Two-letter state codes are skipped: "in", "or", "me", "hi" and "ok" are all US state
      // abbreviations and all common English words, and unlike airport codes they are
      // routinely written in lower case. Full state and city names carry the same meaning
      // without the ambiguity.
      if (typeof field === 'string' && field.trim().length > 2) anyCase.add(field.trim());
    }
  }
  const parts: string[] = [];
  if (anyCase.size) parts.push(`(?i:${[...anyCase].map(escapeRegExp).join('|')})`);
  if (upperOnly.size) parts.push([...upperOnly].map(escapeRegExp).join('|'));
  if (!parts.length) return null;
  // Deno/V8 support inline (?i:) groups, which is what lets one regex mix the two
  // case policies. Word boundaries keep "SNA" from matching inside "SNAP".
  return new RegExp(`\\b(?:${parts.join('|')})\\b`);
}

export type ScopeDecision = 'airport-analysis' | 'follow-up' | 'social' | 'off-topic';

export function classifyScope(
  message: string,
  hasConversationContext = false,
  vocabulary: RegExp | null = null,
): ScopeDecision {
  const text = message.trim();
  if (SOCIAL_ONLY.test(text)) return 'social';
  if (NON_ANALYSIS_TASKS.test(text)) return 'off-topic';
  if (AIRPORT_TERMS.test(text)) return 'airport-analysis';
  if (vocabulary?.test(text)) return 'airport-analysis';
  if (hasConversationContext && text.length <= 300) return 'follow-up';
  return 'off-topic';
}

export const OFF_TOPIC_REPLY =
  'I can only help with airport modernization screening and the available FAA/BTS airport data. Try asking me to compare airports, explain congestion or growth metrics, or assess a covered US airport.';

export const SOCIAL_REPLY =
  'I analyze US airport modernization opportunities using FAA and BTS data. Ask me to compare airports by congestion, traffic, growth, or expansion score, to rank a region such as New England, or to explain how a score is built.';
