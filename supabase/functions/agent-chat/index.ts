// Agent chat endpoint. Runs server-side so OPENAI_API_KEY and AGENT_READER_DSN never
// reach the browser (see docs/08-secrets-management.md).
//
// Deliberately a bounded function-calling loop, not a ReAct/planner-executor agent:
// the question space here is narrow (rank/compare/explain over four small tables), so a
// multi-step reasoning loop with reflection would add latency and cost without changing
// answers. MAX_TOOL_ROUNDS caps the loop in code, not in the prompt.
import { SYSTEM_PROMPT } from './prompt.ts';
import { toolDefinitions, runTool } from './tools.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const MODEL = 'gpt-4o-mini';
const MAX_TOOL_ROUNDS = 4;
const MAX_MESSAGES = 40;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: unknown;
  tool_call_id?: string;
}

async function callOpenAI(messages: ChatMessage[]) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: toolDefinitions,
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY not configured' }, 500);

  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const incoming = Array.isArray(body.messages) ? body.messages : [];
  if (!incoming.length) return json({ error: 'messages[] required' }, 400);

  // Only user/assistant turns are accepted from the client — a client-supplied "system"
  // or "tool" message would let the caller rewrite the agent's instructions or fake
  // tool results, so those roles are dropped rather than trusted.
  const history = incoming
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: String(m.content ?? '').slice(0, 4000) }));

  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...history];
  const toolTrace: { tool: string; args: unknown }[] = [];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const completion = await callOpenAI(messages);
      const choice = completion.choices?.[0];
      const msg = choice?.message;
      if (!msg) return json({ error: 'Empty response from model' }, 502);

      messages.push(msg);

      const calls = msg.tool_calls ?? [];
      if (!calls.length) {
        return json({ reply: msg.content ?? '', tool_trace: toolTrace });
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
        } catch (err) {
          result = { error: `Tool failed: ${err instanceof Error ? err.message : String(err)}` };
        }

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }

    // Loop budget exhausted — return honestly rather than silently truncating.
    return json({
      reply:
        "I wasn't able to finish gathering the data for that question within the tool-call limit. Try asking something more specific, or about fewer airports at once.",
      tool_trace: toolTrace,
      budget_exhausted: true,
    });
  } catch (err) {
    console.error('agent-chat error:', err);
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
