# Public Deployment Hardening

## Status

Layers 1–4 are implemented and deployed to Supabase project
`hfwremsegdtqaghuqrdv` on 2026-08-22. The application remains public and requires no
registration.

Layer 0 is an account-owner action. It cannot be completed from this repository. Before
sharing the application broadly, the owner must configure an account-level OpenAI usage
limit that stops API use at the chosen amount, add a lower notification threshold, and use
a project-scoped API key. A project budget or alert alone must not be treated as a hard
cutoff unless the dashboard explicitly states that requests stop when it is reached.

## Threat model

The primary risk is denial of wallet. The browser contains a Supabase publishable key by
design. Database access uses the `agent_reader` role, which can read only the public
BTS/FAA dataset. OpenAI and database credentials remain server-side.

The public `agent-chat` endpoint and signed `twilio-whatsapp` endpoint can create paid
OpenAI requests. Controls therefore bound request frequency and request cost, reduce abuse,
protect media, and expose useful events for operations.

## Implemented controls

### Persistent rate limiting

`agent-chat` applies both limits before calling OpenAI:

- 60 accepted requests per IP-derived bucket per rolling hour.
- 500 accepted requests globally per rolling day.

The hourly cap started at 15 and was raised after it fired during a real evaluation
session: the welcome screen offers nine prepared questions and follow-ups are the feature
being demonstrated, so 15 was below one honest walkthrough and presented as a broken agent
rather than as a cost guard. The 429 body now says which limit was hit, that it is a demo
guard, and that the deterministic analysis panel keeps working. The daily global cap is
what actually bounds spend; the per-IP cap only stops one caller consuming it alone.

`RATE_LIMIT_EXEMPT_IP_HASHES` (optional, comma-separated salted hashes) skips the per-IP
cap for listed callers — the development machine, so building and testing does not spend
the reviewer's budget. Exempt callers are still subject to the global daily cap, so the
exemption cannot produce unbounded spend. Only hashes are configured, never addresses, and
the value is a server-side secret that never reaches the browser.

`twilio-whatsapp` separately allows 20 accepted requests per salted sender hash per rolling
hour. Raw phone numbers are neither stored nor logged by application code.

Client IP addresses are never stored. The function stores
`SHA-256(client IP + RATE_LIMIT_SALT)`. `RATE_LIMIT_SALT` is a Supabase secret generated
during deployment.

Counters live in `public.rate_limit_hits`. RLS is enabled and all direct table privileges
are revoked from `public`, `anon`, and `authenticated`. `agent_reader` receives only
`EXECUTE` on `check_rate_limit`.

`check_rate_limit` is `SECURITY DEFINER`, validates its inputs, fixes its `search_path`, and
uses a transaction-level advisory lock per bucket. The lock makes count-and-insert atomic,
so concurrent requests cannot race past a limit.

Migration `20260822000200_least_privilege_constraints_and_indexes.sql` also revokes the
Supabase default function grants explicitly from `anon` and `authenticated`. Revoking only
`PUBLIC` was insufficient because those roles had direct grants. Live verification confirms
neither public role can execute either `SECURITY DEFINER` function, and `agent_reader`
cannot select the counter table directly.

Denied requests return `429`, a plain-language JSON error, and `Retry-After`. Limiter
failures return `503` and fail closed; they never fall through to a paid OpenAI request.

Rows older than eight days are deleted daily. The deployment enables `pg_cron` and runs
`public.cleanup_rate_limit_hits()` at 03:17 UTC.

### Per-request cost ceilings

The function enforces:

- 20 client history messages.
- 2,000 characters per accepted message.
- 32 KiB request bodies, checked against `Content-Length` and actual bytes before JSON
  parsing.
- 320 completion tokens per OpenAI call.
- 12 KiB serialized tool results before results enter later tool rounds.
- Four tool rounds, unchanged from the existing bounded loop.

Tool results that exceed the ceiling become a small object containing a truncation marker,
original byte count, and bounded preview. This keeps model context growth predictable.

### Origin policy and error handling

Allowed browser origins:

- `https://airport-investment-intelligence.vercel.app`
- `http://localhost:5173`

Deployments may override this list with the comma-separated `ALLOWED_ORIGINS` Supabase
secret. CORS responses vary on `Origin`. Browser requests from other origins receive
`403`. Requests without an `Origin` header remain possible by design; CORS is not an
authentication mechanism and cannot stop direct HTTP clients.

Both Edge Functions now use the shared origin policy. Unexpected `agent-chat` failures are
logged with a correlation ID. Clients receive a generic error and that ID, not upstream
error text. `airport-data` also returns a generic error on unexpected failures.

The web deployment defines browser security headers in `vercel.json`: CSP with a narrow
Supabase `connect-src`, HSTS, `frame-ancestors 'none'`, `nosniff`, a strict referrer policy,
and a permissions policy that disables camera, geolocation, payment, and USB access.

The chat boundary validates the complete JSON shape before consuming a rate-limit slot.
Malformed top-level bodies, null message entries, non-string content, and histories without
a real user turn receive `400`; client-supplied system and tool roles remain excluded.

### WhatsApp webhook and media controls

- `X-Twilio-Signature` is verified with HMAC-SHA1 against the exact canonical public
  webhook URL and every signed form field. Supabase's internal request URL is not used.
- Only one `audio/*` attachment is accepted for voice input. The initial media URL must be
  HTTPS on `api.twilio.com` and inside the signed Account SID path.
- Twilio's authenticated redirect to its media store is followed only after that initial
  allowlist check. The response is streamed into a bounded 10 MB buffer.
- Audio is sent server-to-server to `gpt-4o-mini-transcribe`, then discarded. It is never
  returned to the browser or written to the database.
- Long agent replies are split on natural text boundaries into TwiML messages below 1,400
  characters, leaving margin under Twilio's general 1,600-character body limit.

### Monitoring

Supabase Function logs emit structured `rate_limit_denied` events with `scope` set to `ip`
or `global`. The IP value in logs is the same salted hash, never the raw address.

Useful read-only operator queries in the Supabase SQL editor:

```sql
-- Accepted chat requests in the last 24 hours.
select count(*)
from public.rate_limit_hits
where bucket = 'global' and hit_at > now() - interval '24 hours';

-- Busiest anonymous IP buckets in the last hour.
select bucket, count(*) as requests
from public.rate_limit_hits
where bucket like 'ip:%' and hit_at > now() - interval '1 hour'
group by bucket
order by requests desc
limit 20;

-- Cleanup schedule, when pg_cron is enabled.
select jobname, schedule, active
from cron.job
where jobname = 'cleanup-rate-limit-hits';
```

Operational checks:

- Review OpenAI usage and the account-level cutoff regularly.
- Keep a notification threshold below the cutoff.
- Review Supabase invocation counts and `rate_limit_denied` log events.
- Investigate unexpected increases in the global counter even when no requests are denied.

## Deployment record

Applied migrations:

`supabase/migrations/20260822000000_public_endpoint_hardening.sql`

`supabase/migrations/20260822000100_schedule_rate_limit_cleanup.sql`

Configured Supabase secrets:

- `RATE_LIMIT_SALT`
- `ALLOWED_ORIGINS`
- `TWILIO_AUTH_TOKEN`

Deployed functions:

- `agent-chat`
- `airport-data`
- `twilio-whatsapp`

Live verification completed after deployment:

- Allowed-origin airport data request: `200`, with the current national airport directory
  and regional score set.
- Allowed-origin chat request: `200`, one real tool call and a valid answer.
- Disallowed browser origin: `403` with `Origin not allowed`.
- Request body over 32 KiB: `413` with `Request body exceeds 32 KB.`
- Local Node tests: 4/4 passed.
- Live WhatsApp voice note: signed request accepted, Twilio media redirect followed,
  OpenAI transcription completed, agent answer produced, and split TwiML reply delivered.
- Deno checks for all three Edge Functions: passed.
- Production TypeScript/Vite build: passed.
- Node regression suite: 7 passed.
- Deno Edge Function suite: 12 passed, including malformed chat-body cases.
- Live malformed `null` chat body: `400` with a stable JSON error.
- Live airport data: `200`, 347 covered airports, 163 current scores, and the correct
  300-departure sample-floor disclosure.
- Production dependency audit: zero known vulnerabilities.
- Public `check_rate_limit` RPC attempt: `401 permission denied`; the same operation through
  `agent_reader` remains functional in a live chat request.
- Six database domain constraints validated against all current rows.
- Monthly-metric query uses `idx_metrics_airport_scope_time`; measured execution was
  0.096 ms for the representative two-airport range query.
- `airport-data` payload reduced from 192,546 to 56,874 bytes by keeping score audit inputs
  server-side and returning a count instead of the full airport directory.

## Layer 0 owner checklist

Complete these in the OpenAI Platform dashboard:

1. Place this application in its own OpenAI project.
2. Create a project-scoped API key and replace the current `OPENAI_API_KEY` Supabase
   secret.
3. Configure the smallest practical account-level usage limit that explicitly stops API
   requests when reached.
4. Configure an email notification threshold below that amount.
5. Test the notification recipients and record the chosen values outside the repository.

Do not store the API key, salt, database password, or account billing values in Git.

## Deliberate exclusions

Sign-in, CAPTCHA, a WAF, endpoint obfuscation, and removal of the public link remain out of
scope. They add reviewer friction or do not address direct requests. Persistent rate
limits, bounded per-request cost, and an account-level cutoff are the proportional controls
for this public demo.
