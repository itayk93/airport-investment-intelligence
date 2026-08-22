import { buildSystemPrompt } from '../agent-chat/prompt.ts';
import { classifyScope, OFF_TOPIC_REPLY, SOCIAL_REPLY } from '../agent-chat/scopeGuard.ts';
import { toolDefinitions, runTool } from '../agent-chat/tools.ts';
import { describeCongestionCoverage, getCoverage, type CoverageRow } from './db.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const MODEL = 'gpt-4o-mini';
const MAX_TOOL_ROUNDS = 4;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 2_000;
const MAX_TOOL_RESULT_BYTES = 12 * 1024;
const MAX_OUTPUT_TOKENS = 320;
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
      return 'about a year of congestion data';
    }));
  return pending;
}
const SCORE_DISCLOSURE =
  'Caveat: modeled proxy, ranked within the airport\'s own region, over one year of congestion data that still mixes weather with structural congestion. Not an ROI estimate.';

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

function addScoreDisclosure(reply: string, toolTrace: AgentResult['tool_trace']) {
  const scoreMetrics = new Set([
    'capacity_pressure',
    'forecast_growth_gap_pct',
    'unmet_demand_score',
    'expansion_score',
  ]);
  const usedScores = toolTrace.some((call) => {
    if (call.tool !== 'get_airport_data' || !call.args || typeof call.args !== 'object') return false;
    const metrics = (call.args as { metrics?: unknown }).metrics;
    return Array.isArray(metrics) && metrics.some((metric) => scoreMetrics.has(String(metric)));
  });
  if (!usedScores) return reply;
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
      temperature: 0.2,
      max_tokens: MAX_OUTPUT_TOKENS,
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
  const scope = classifyScope(history[latestUserIndex].content, latestUserIndex > 0);
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
        reply: addScoreDisclosure(modelMessage.content ?? '', toolTrace),
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
