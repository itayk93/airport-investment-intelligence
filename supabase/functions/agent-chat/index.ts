// Agent chat endpoint. Runs server-side so OPENAI_API_KEY and AGENT_READER_DSN never
// reach the browser (see docs/08-secrets-management.md).
//
// Deliberately a bounded function-calling loop, not a ReAct/planner-executor agent:
// the question space here is narrow (rank/compare/explain over four small tables), so a
// multi-step reasoning loop with reflection would add latency and cost without changing
// answers. MAX_TOOL_ROUNDS caps the loop in code, not in the prompt.
import { runAgent } from '../_shared/agent.ts';
import { checkRateLimit } from '../_shared/db.ts';
import { parseChatInput } from './chatInput.ts';

// Per-caller hourly cap. Sized for a full evaluation session (nine prepared questions plus
// follow-ups), not for load: the 500/day global cap is what bounds actual spend.
const RATE_LIMIT_PER_IP_PER_HOUR = 60;

// Hashed addresses exempt from the per-IP cap — the development machine, so building and
// testing the agent does not consume the budget real visitors need. Stored as a Supabase
// secret rather than in code: it is the salted hash, not the address, and it never reaches
// the browser. The global daily cap still applies to exempt callers, so this cannot run up
// unbounded spend. Set with:
//   npx supabase secrets set RATE_LIMIT_EXEMPT_IP_HASHES=<hash>[,<hash>]
const EXEMPT_IP_HASHES = new Set(
  (Deno.env.get('RATE_LIMIT_EXEMPT_IP_HASHES') ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
);
import { isAllowedOrigin, json, preflight } from '../_shared/http.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const RATE_LIMIT_SALT = Deno.env.get('RATE_LIMIT_SALT');
const MAX_BODY_BYTES = 32 * 1024;
const encoder = new TextEncoder();

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

  let body: unknown;
  try {
    const raw = new Uint8Array(await req.arrayBuffer());
    if (raw.byteLength > MAX_BODY_BYTES) return json({ error: 'Request body exceeds 32 KB.' }, 413, req);
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, req);
  }

  const parsed = parseChatInput(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400, req);

  try {
    const ipHash = await sha256(`${clientIp(req)}:${RATE_LIMIT_SALT}`);
    // 15/hour turned out to be below what one real session uses: the welcome screen offers
    // nine prepared questions, and follow-ups are the feature being demonstrated, so a
    // visitor working through the app hit the wall mid-session and saw a broken agent
    // rather than a cost guard. The daily global cap below is the actual spend ceiling;
    // this one only stops a single caller from consuming it alone.
    const exempt = EXEMPT_IP_HASHES.has(ipHash);
    const ipAllowed = exempt ||
      (await checkRateLimit(`ip:${ipHash}`, RATE_LIMIT_PER_IP_PER_HOUR, '1 hour'));
    if (!ipAllowed) {
      console.warn(JSON.stringify({ event: 'rate_limit_denied', scope: 'ip', ip_hash: ipHash }));
      return json(
        {
          error:
            `Rate limit reached: ${RATE_LIMIT_PER_IP_PER_HOUR} questions per hour from one address. This is a demo cost guard, not an agent failure — the analysis panel keeps working, and chat resumes within the hour.`,
        },
        429,
        req,
        { 'Retry-After': '3600' },
      );
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

  try {
    return json(await runAgent(parsed.messages), 200, req);
  } catch (err) {
    const correlationId = crypto.randomUUID();
    console.error(`agent-chat error [${correlationId}]:`, err);
    return json({ error: 'The agent could not complete the request.', correlation_id: correlationId }, 500, req);
  }
});
