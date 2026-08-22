import { runAgent } from '../_shared/agent.ts';
import { checkRateLimit } from '../_shared/db.ts';

const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
const RATE_LIMIT_SALT = Deno.env.get('RATE_LIMIT_SALT');
const MAX_BODY_BYTES = 16 * 1024;
const MAX_MESSAGE_CHARS = 2_000;
const encoder = new TextEncoder();

function twiml(message: string, status = 200): Response {
  const escaped = message
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`, {
    status,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}

async function hmacSha1Base64(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function validTwilioSignature(req: Request, params: URLSearchParams): Promise<boolean> {
  const received = req.headers.get('x-twilio-signature');
  if (!received || !TWILIO_AUTH_TOKEN) return false;

  const names = [...new Set(params.keys())].sort();
  let signed = req.url;
  for (const name of names) {
    for (const value of params.getAll(name).sort()) signed += `${name}${value}`;
  }
  const expected = await hmacSha1Base64(TWILIO_AUTH_TOKEN, signed);
  if (expected.length !== received.length) return false;

  let difference = 0;
  for (let index = 0; index < expected.length; index++) {
    difference |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  }
  return difference === 0;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return twiml('POST only.', 405);
  if (!TWILIO_AUTH_TOKEN || !RATE_LIMIT_SALT) {
    console.error('twilio-whatsapp missing required server configuration');
    return twiml('The airport agent is temporarily unavailable.', 503);
  }

  const declaredLength = Number(req.headers.get('content-length') || 0);
  if (declaredLength > MAX_BODY_BYTES) return twiml('Message is too large.', 413);

  let params: URLSearchParams;
  try {
    const raw = new Uint8Array(await req.arrayBuffer());
    if (raw.byteLength > MAX_BODY_BYTES) return twiml('Message is too large.', 413);
    params = new URLSearchParams(new TextDecoder().decode(raw));
  } catch {
    return twiml('Invalid request.', 400);
  }

  if (!(await validTwilioSignature(req, params))) {
    console.warn(JSON.stringify({ event: 'twilio_signature_denied' }));
    return twiml('Invalid request.', 403);
  }

  const from = params.get('From')?.trim() ?? '';
  const body = params.get('Body')?.trim().slice(0, MAX_MESSAGE_CHARS) ?? '';
  if (!from.startsWith('whatsapp:') || !body) return twiml('Send a question about one of the covered airports.', 400);

  try {
    const senderHash = await sha256(`${from}:${RATE_LIMIT_SALT}`);
    if (!(await checkRateLimit(`whatsapp:${senderHash}`, 20, '1 hour'))) {
      return twiml('Too many questions. Try again in an hour.', 429);
    }

    const result = await runAgent([{ role: 'user', content: body }]);
    return twiml(result.reply);
  } catch (error) {
    const correlationId = crypto.randomUUID();
    console.error(`twilio-whatsapp error [${correlationId}]:`, error);
    return twiml(`The agent could not complete that request. Reference: ${correlationId}`, 500);
  }
});
