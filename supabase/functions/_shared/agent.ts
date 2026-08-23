import { buildSystemPrompt } from '../agent-chat/prompt.ts';
import {
  buildScopeVocabulary,
  classifyScope,
  OFF_TOPIC_REPLY,
  SOCIAL_REPLY,
  type ScopeVocabularySource,
} from '../agent-chat/scopeGuard.ts';
import { toolDefinitions, runTool } from '../agent-chat/tools.ts';
import {
  describeCongestionCoverage,
  getCoverage,
  getScopeVocabulary,
  type CoverageRow,
} from './db.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const MODEL = 'gpt-5-mini';
// The GPT-5 family takes different parameters from the 4o family on chat/completions: the
// output cap is `max_completion_tokens`, and `temperature` is not accepted at all. Keeping
// this as a derived flag rather than editing the body by hand means switching MODEL back to
// a 4o-family id stays a one-line change.
const IS_GPT5 = MODEL.startsWith('gpt-5');
const MAX_TOOL_ROUNDS = 4;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 2_000;
// A region listing now carries every airport's scores, because ranking from a hand-picked
// code list produced partial rankings. The largest region (Pacific, 57 covered) lands near
// 12 KB, so the old 12 KB budget truncated it — and a truncated tool result reaches the
// model as broken JSON, which is why it returned an empty answer rather than a wrong one.
// The headroom also absorbs the coverage the refresh cron keeps adding. At gpt-5-mini input
// pricing the worst case is a fraction of a cent per call.
const MAX_TOOL_RESULT_BYTES = 32 * 1024;
// Visible answer length. The prose budget in the prompt is ~120-150 words, well inside this.
const MAX_OUTPUT_TOKENS = 320;
// GPT-5 spends output tokens on reasoning before it writes anything, and those count
// against the same ceiling — a 320 cap can be consumed entirely by reasoning and return an
// empty message. So the cap is raised and reasoning is held to the lowest setting: this is
// retrieval and explanation over four small tables, not a problem that needs deliberation.
const MAX_COMPLETION_TOKENS = 2_000;
const REASONING_EFFORT = 'low';
const encoder = new TextEncoder();

// Memoized for the isolate's lifetime: the underlying data changes at most monthly (the
// refresh cron), so re-querying it on every chat turn would add a round trip to the hot
// path for a value that is effectively static. A cold start picks up the new period.
let coverageMemo: Promise<string> | null = null;
function congestionCoverage(): Promise<string> {
  // Bound to a local so the type stays Promise<string>: the catch below clears the memo
  // from inside a closure, which defeats narrowing on the module-level binding.
  const pending = coverageMemo ?? (coverageMemo = getCoverage()
    .then((rows: unknown) => describeCongestionCoverage(rows as CoverageRow[]))
    .catch(() => {
      coverageMemo = null; // a failed lookup must not be cached for the isolate's life
      return 'two years of congestion data';
    }));
  return pending;
}
// The scope guard's airport vocabulary, memoized like the coverage sentence above and for
// the same reason: the airport directory changes when ingestion runs, not per request. A
// failed lookup is not cached, and falls back to null — which leaves the static aviation
// terms doing the work, the behaviour before this was added.
let vocabularyMemo: Promise<RegExp | null> | null = null;
function scopeVocabulary(): Promise<RegExp | null> {
  const pending = vocabularyMemo ?? (vocabularyMemo = getScopeVocabulary()
    .then((rows: unknown) => buildScopeVocabulary(rows as ScopeVocabularySource[]))
    .catch(() => {
      vocabularyMemo = null;
      return null;
    }));
  return pending;
}

// Deliberately short, and shown once per conversation rather than under every message.
// The previous version ran 33 words on every score answer, which is how a disclosure turns
// into wallpaper that nobody reads — and it duplicated the situational caveat the model had
// often already written. It also hardcoded "one year" of data, which the refresh cron made
// wrong. What stays is the part a reader could actually be misled by: these are modeled,
// region-relative, and not a return estimate. Situational caveats (de-icing at northern
// airports, small samples) are the model's job and are raised in context.
const SCORE_DISCLOSURE =
  'Scores are a modeled screening proxy, ranked within each airport\'s own region — not an ROI estimate.';

export interface AgentInputMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: unknown;
  tool_call_id?: string;
}

export interface AgentResult {
  reply: string;
  tool_trace: { tool: string; args: unknown }[];
  budget_exhausted?: boolean;
}

function addScoreDisclosure(
  reply: string,
  toolTrace: AgentResult['tool_trace'],
  history: ModelMessage[],
) {
  const scoreMetrics = new Set([
    'capacity_pressure',
    'forecast_growth_gap_pct',
    'unmet_demand_score',
    'expansion_score',
  ]);
  const usedScores = toolTrace.some((call) => {
    if (!call.args || typeof call.args !== 'object') return false;
    // list_airports now returns the score columns too, because ranking a region from a
    // hand-picked code list was producing partial rankings. That made it a score source,
    // so it has to trigger the disclosure as well — otherwise the fix would have quietly
    // opened a path to score answers that carry no disclosure at all.
    if (call.tool === 'list_airports') return true;
    if (call.tool !== 'get_airport_data') return false;
    const metrics = (call.args as { metrics?: unknown }).metrics;
    return Array.isArray(metrics) && metrics.some((metric) => scoreMetrics.has(String(metric)));
  });
  if (!usedScores) return reply;
  // The prompt forbids a generic closing caveat because the system appends one, and the
  // model does it anyway. Compliance is not a mechanism: strip a trailing paragraph that
  // is merely restating the standing disclosure. A caveat that raises something specific
  // (de-icing, a small sample, a particular month) does not match and is left alone.
  const generic = /(modeled|modelled)\s+proxy|not\s+an\s+roi|roi\s+estimate|project[- ]cost/i;
  reply = reply.trim().replace(/\n\n(?:\*\*)?caveat\b[^\n]*(?:\n(?!\n)[^\n]*)*$/i, (match) =>
    generic.test(match) ? '' : match,
  );
  // Once per conversation, not once per message. The turn's own history is the state: if an
  // earlier answer already carries it, the reader has seen it and repeating it only trains
  // them to skip the last paragraph.
  const alreadyDisclosed = history.some(
    (message) => message.role === 'assistant' && String(message.content ?? '').includes(SCORE_DISCLOSURE),
  );
  if (alreadyDisclosed) return reply;
  return `${reply.trim()}\n\n${SCORE_DISCLOSURE}`;
}

function boundedToolResult(result: unknown): string {
  const serialized = JSON.stringify(result);
  if (encoder.encode(serialized).byteLength <= MAX_TOOL_RESULT_BYTES) return serialized;

  const originalBytes = encoder.encode(serialized).byteLength;
  let low = 0;
  let high = serialized.length;
  let bounded = '';
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = JSON.stringify({
      truncated: true,
      original_bytes: originalBytes,
      preview: serialized.slice(0, middle),
    });
    if (encoder.encode(candidate).byteLength <= MAX_TOOL_RESULT_BYTES) {
      bounded = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return bounded;
}

async function callOpenAI(messages: ModelMessage[], requireTool: boolean) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: toolDefinitions,
      tool_choice: requireTool ? 'required' : 'auto',
      ...(IS_GPT5
        ? { max_completion_tokens: MAX_COMPLETION_TOKENS, reasoning_effort: REASONING_EFFORT }
        : { temperature: 0.2, max_tokens: MAX_OUTPUT_TOKENS }),
    }),
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
  return response.json();
}

/** Shared channel-independent agent. HTTP concerns stay in each channel adapter. */
export async function runAgent(input: AgentInputMessage[]): Promise<AgentResult> {
  const history = input
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-MAX_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: String(message.content ?? '').slice(0, MAX_MESSAGE_CHARS),
    }));
  if (!history.length) throw new Error('At least one message is required');

  const latestUserIndex = history.findLastIndex((message) => message.role === 'user');
  if (latestUserIndex < 0) throw new Error('At least one user message is required');
  const scope = classifyScope(
    history[latestUserIndex].content,
    latestUserIndex > 0,
    await scopeVocabulary(),
  );
  if (scope === 'off-topic' || scope === 'social') {
    return {
      reply: scope === 'social' ? SOCIAL_REPLY : OFF_TOPIC_REPLY,
      tool_trace: [],
    };
  }

  const messages: ModelMessage[] = [
    { role: 'system', content: buildSystemPrompt(await congestionCoverage()) },
    ...history,
  ];
  const toolTrace: AgentResult['tool_trace'] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const completion = await callOpenAI(messages, round === 0);
    const modelMessage = completion.choices?.[0]?.message;
    if (!modelMessage) throw new Error('Empty response from model');
    messages.push(modelMessage);

    const calls = modelMessage.tool_calls ?? [];
    if (!calls.length) {
      return {
        reply: addScoreDisclosure(modelMessage.content ?? '', toolTrace, history),
        tool_trace: toolTrace,
      };
    }

    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        args = {};
      }
      toolTrace.push({ tool: call.function.name, args });

      let result: unknown;
      try {
        result = await runTool(call.function.name, args);
      } catch (error) {
        result = { error: `Tool failed: ${error instanceof Error ? error.message : String(error)}` };
      }
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: boundedToolResult(result),
      });
    }
  }

  return {
    reply:
      "I wasn't able to finish gathering the data within the tool-call limit. Try asking about fewer airports at once.",
    tool_trace: toolTrace,
    budget_exhausted: true,
  };
}
