const AIRPORT_TERMS = /\b(airport|airports|airfield|aviation|flight|flights|passenger|passengers|departure|departures|landing|landings|runway|runways|terminal|terminals|gate|gates|congestion|delay|delays|cancellation|capacity|long[- ]haul|enplanement|taxi[- ]out|modernization|expansion|investment|faa|bts|taf|t-?100|sfo|lax|sna|anc|bos|los angeles|santa ana|anchorage|boston|san francisco|new england)\b/i;

// Requests for a different deliverable stay out of scope even when they mention an
// airport. This prevents prompts such as "write Python code for LAX landings" from
// slipping through a broad airport-keyword check.
const NON_ANALYSIS_TASKS = /\b(write|create|generate|build|make|show|give|provide|implement|debug|fix|refactor|translate|summarize)\b[\s\S]{0,80}\b(code|script|program|app|website|html|css|javascript|typescript|python|sql|regex|poem|story|email|resume|cover letter|image|logo)\b|\b(code|script|program)\b[\s\S]{0,40}\b(that|to|for)\b/i;

const SOCIAL_ONLY = /^(hi|hello|hey|thanks|thank you|help|what can you do)[.!?\s]*$/i;

export type ScopeDecision = 'airport-analysis' | 'follow-up' | 'social' | 'off-topic';

export function classifyScope(message: string, hasConversationContext = false): ScopeDecision {
  const text = message.trim();
  if (SOCIAL_ONLY.test(text)) return 'social';
  if (NON_ANALYSIS_TASKS.test(text)) return 'off-topic';
  if (AIRPORT_TERMS.test(text)) return 'airport-analysis';
  if (hasConversationContext && text.length <= 300) return 'follow-up';
  return 'off-topic';
}

export const OFF_TOPIC_REPLY =
  'I can only help with airport modernization screening and the available FAA/BTS airport data. Try asking me to compare airports, explain congestion or growth metrics, or assess an airport in the five-airport pilot.';

export const SOCIAL_REPLY =
  'I analyze US airport modernization opportunities using FAA and BTS data. Ask me to compare SFO, LAX, SNA, ANC, or BOS, or to explain their congestion, traffic, growth, or expansion scores.';
