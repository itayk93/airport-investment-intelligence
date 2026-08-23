import { runAgent } from '../_shared/agent.ts';
import { checkRateLimit, recentWhatsappTurns, recordWhatsappTurn } from '../_shared/db.ts';

const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const RATE_LIMIT_SALT = Deno.env.get('RATE_LIMIT_SALT');
const MAX_BODY_BYTES = 16 * 1024;
const MAX_MESSAGE_CHARS = 2_000;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
// Twilio signs the configured public URL. Supabase may expose a different internal URL to
// the Edge runtime, so signature validation must use this exact canonical webhook value.
const TWILIO_WEBHOOK_URL =
  'https://hfwremsegdtqaghuqrdv.supabase.co/functions/v1/twilio-whatsapp';
const encoder = new TextEncoder();
const AUDIO_EXTENSIONS: Record<string, string> = {
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'audio/m4a': 'm4a',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/opus': 'ogg',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'audio/x-m4a': 'm4a',
};

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function splitMessage(message: string, limit = 1_400): string[] {
  const remaining = message.trim();
  if (remaining.length <= limit) return [remaining];

  const chunks: string[] = [];
  let rest = remaining;
  while (rest.length > limit) {
    const window = rest.slice(0, limit + 1);
    const paragraphBreak = window.lastIndexOf('\n\n');
    const lineBreak = window.lastIndexOf('\n');
    const space = window.lastIndexOf(' ');
    const naturalBreak = Math.max(paragraphBreak, lineBreak, space);
    const cut = naturalBreak > 0 ? naturalBreak : limit;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function twiml(message: string, status = 200): Response {
  const messages = splitMessage(message)
    .map((chunk) => `<Message>${escapeXml(chunk)}</Message>`)
    .join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${messages}</Response>`, {
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
  let signed = TWILIO_WEBHOOK_URL;
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

function twilioMediaUrl(value: string, accountSid: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'api.twilio.com') return null;
    if (!/^AC[a-fA-F0-9]{32}$/.test(accountSid)) return null;
    if (!url.pathname.startsWith(`/2010-04-01/Accounts/${accountSid}/Messages/`)) return null;
    return url;
  } catch {
    return null;
  }
}

async function readBounded(response: Response, limit: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > limit) throw new Error('Audio exceeds size limit');
  if (!response.body) throw new Error('Twilio returned an empty media response');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error('Audio exceeds size limit');
    }
    chunks.push(value);
  }

  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function transcribeAudio(params: URLSearchParams): Promise<string> {
  if (!OPENAI_API_KEY || !TWILIO_AUTH_TOKEN) throw new Error('Transcription is not configured');

  const contentType = (params.get('MediaContentType0') ?? '').split(';')[0].trim().toLowerCase();
  const extension = AUDIO_EXTENSIONS[contentType];
  if (!extension) throw new Error('Unsupported audio format');

  const accountSid = params.get('AccountSid')?.trim() ?? '';
  const mediaUrl = twilioMediaUrl(params.get('MediaUrl0')?.trim() ?? '', accountSid);
  if (!mediaUrl) throw new Error('Invalid Twilio media URL');

  const mediaResponse = await fetch(mediaUrl, {
    headers: { Authorization: `Basic ${btoa(`${accountSid}:${TWILIO_AUTH_TOKEN}`)}` },
    // Twilio's authenticated API URL redirects to its media store. The initial URL is
    // signature-bound and allowlisted above; following Twilio's own redirect is required.
    redirect: 'follow',
  });
  if (!mediaResponse.ok) throw new Error(`Twilio media ${mediaResponse.status}`);
  const audio = await readBounded(mediaResponse, MAX_AUDIO_BYTES);

  const form = new FormData();
  form.append('model', 'gpt-4o-mini-transcribe');
  form.append(
    'prompt',
    'Airport investment analysis. Airport codes may include SFO, LAX, SNA, ANC, and BOS.',
  );
  form.append(
    'file',
    new Blob([audio.buffer as ArrayBuffer], { type: contentType }),
    `whatsapp-voice.${extension}`,
  );

  const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  });
  if (!transcriptionResponse.ok) {
    throw new Error(`OpenAI transcription ${transcriptionResponse.status}`);
  }
  const result = await transcriptionResponse.json();
  const transcript = typeof result.text === 'string' ? result.text.trim() : '';
  if (!transcript) throw new Error('Transcription was empty');
  return transcript.slice(0, MAX_MESSAGE_CHARS);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return twiml('POST only.', 405);
  if (!TWILIO_AUTH_TOKEN || !OPENAI_API_KEY || !RATE_LIMIT_SALT) {
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
  let body = params.get('Body')?.trim().slice(0, MAX_MESSAGE_CHARS) ?? '';
  const mediaCount = Number(params.get('NumMedia') || 0);
  const mediaType = (params.get('MediaContentType0') ?? '').toLowerCase();
  const hasAudio = mediaCount === 1 && mediaType.startsWith('audio/');
  if (!from.startsWith('whatsapp:') || (!body && !hasAudio)) {
    return twiml('Send a text or voice question about one of the covered airports.', 400);
  }

  try {
    const senderHash = await sha256(`${from}:${RATE_LIMIT_SALT}`);
    if (!(await checkRateLimit(`whatsapp:${senderHash}`, 20, '1 hour'))) {
      return twiml('Too many questions. Try again in an hour.', 429);
    }

    if (!body && hasAudio) body = await transcribeAudio(params);

    // Twilio delivers each message on its own, so without this the channel answered every
    // question cold and "why?" reached the agent with nothing to refer to. History is read
    // under the same sender hash used for rate limiting — the number itself is never
    // stored — and expires after two hours (see the migration).
    let history: { role: 'user' | 'assistant'; content: string }[] = [];
    try {
      history = await recentWhatsappTurns(senderHash);
    } catch (error) {
      // A memory lookup failure degrades follow-ups; it must not fail the question itself.
      console.warn('whatsapp history unavailable:', error);
    }

    const result = await runAgent([...history, { role: 'user', content: body }]);

    try {
      await recordWhatsappTurn(senderHash, 'user', body);
      await recordWhatsappTurn(senderHash, 'assistant', result.reply);
    } catch (error) {
      console.warn('whatsapp history not recorded:', error);
    }
    return twiml(result.reply);
  } catch (error) {
    const correlationId = crypto.randomUUID();
    console.error(`twilio-whatsapp error [${correlationId}]:`, error);
    return twiml(`The agent could not complete that request. Reference: ${correlationId}`, 500);
  }
});
