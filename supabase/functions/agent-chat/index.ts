// Agent chat endpoint. Runs server-side so OPENAI_API_KEY and AGENT_READER_DSN never
// reach the browser (see docs/08-secrets-management.md).
//
// Deliberately a bounded function-calling loop, not a ReAct/planner-executor agent:
// the question space here is narrow (rank/compare/explain over four small tables), so a
// multi-step reasoning loop with reflection would add latency and cost without changing
// answers. MAX_TOOL_ROUNDS caps the loop in code, not in the prompt.
import { runAgent } from '../_shared/agent.ts';
import { checkRateLimit } from '../_shared/db.ts';
import { isAllowedOrigin, json, preflight } from '../_shared/http.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const RATE_LIMIT_SALT = Deno.env.get('RATE_LIMIT_SALT');
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 2_000;
const MAX_BODY_BYTES = 32 * 1024;
const encoder = new TextEncoder();

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | null;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',').map((part) => part.trim());
  return req.headers.get('cf-connecting-ip')?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    forwarded?.at(-1) ||
    'unknown';
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  if (!isAllowedOrigin(req)) return json({ error: 'Origin not allowed' }, 403, req);
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405, req);
  if (!OPENAI_API_KEY || !RATE_LIMIT_SALT) {
    console.error('agent-chat missing required server configuration');
    return json({ error: 'Service temporarily unavailable.' }, 503, req);
  }

  const declaredLength = Number(req.headers.get('content-length') || 0);
  if (declaredLength > MAX_BODY_BYTES) return json({ error: 'Request body exceeds 32 KB.' }, 413, req);

  let body: { messages?: ChatMessage[] };
  try {
    const raw = new Uint8Array(await req.arrayBuffer());
    if (raw.byteLength > MAX_BODY_BYTES) return json({ error: 'Request body exceeds 32 KB.' }, 413, req);
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, req);
  }

  const incoming = Array.isArray(body.messages) ? body.messages : [];
  if (!incoming.length) return json({ error: 'messages[] required' }, 400, req);

  try {
    const ipHash = await sha256(`${clientIp(req)}:${RATE_LIMIT_SALT}`);
    const ipAllowed = await checkRateLimit(`ip:${ipHash}`, 15, '1 hour');
    if (!ipAllowed) {
      console.warn(JSON.stringify({ event: 'rate_limit_denied', scope: 'ip', ip_hash: ipHash }));
      return json({ error: 'Too many requests. Try again in an hour.' }, 429, req, { 'Retry-After': '3600' });
    }
    const globalAllowed = await checkRateLimit('global', 500, '1 day');
    if (!globalAllowed) {
      console.warn(JSON.stringify({ event: 'rate_limit_denied', scope: 'global' }));
      return json({ error: 'Daily service limit reached. Try again tomorrow.' }, 429, req, { 'Retry-After': '86400' });
    }
  } catch (err) {
    console.error('rate limiter unavailable:', err);
    return json({ error: 'Service temporarily unavailable.' }, 503, req);
  }

  // Only user/assistant turns are accepted from the client — a client-supplied "system"
  // or "tool" message would let the caller rewrite the agent's instructions or fake
  // tool results, so those roles are dropped rather than trusted.
  const history = incoming
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: String(m.content ?? '').slice(0, MAX_MESSAGE_CHARS) }));

  try {
    return json(await runAgent(history), 200, req);
  } catch (err) {
    const correlationId = crypto.randomUUID();
    console.error(`agent-chat error [${correlationId}]:`, err);
    return json({ error: 'The agent could not complete the request.', correlation_id: correlationId }, 500, req);
  }
});
