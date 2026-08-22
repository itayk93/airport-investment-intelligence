# Secrets Management — OpenAI and Twilio Credentials

Decision: the OpenAI API key is stored as a **Supabase secret** (Edge Function secret /
Vault), not added to the local `.env` file like the Supabase keys were.

The same rule applies to `TWILIO_AUTH_TOKEN`. It authenticates media downloads and verifies
inbound webhook signatures, so it is server-only and stored as a Supabase Edge Function
secret. The public Account SID, Sandbox number, join phrase, QR payload, and webhook URL
are configuration identifiers, not authentication credentials.

## Why not just add it to `.env` like everything else

Everything currently in `.env` (Supabase URL, publishable key, secret key, DB URL) is
already scoped to one specific backend: this repo, running locally, talking to one
specific Supabase project. The OpenAI key is different in kind — it's a third-party
provider credential, not project infrastructure, and:

1. **`.env` is a local file.** It only exists on this machine, inside this checkout. If
   the agent backend later runs as a Supabase Edge Function (server-side, close to the
   data it's reading from `airport_scores`/`airport_metrics_monthly`), a local `.env`
   file doesn't exist there at all — the runtime needs the secret injected by the
   platform itself.
2. **Least-privilege / rotation.** A secret stored in Supabase's own secret store is
   scoped to that project, rotatable from one place (the dashboard or CLI), and never
   touches a developer's disk as plaintext beyond the one time it's typed in. A `.env`
   file, by contrast, tends to get copied around, backed up, or accidentally included in
   a `zip` of the repo for submission — exactly the kind of leak surface this assignment
   involves, since deliverables get uploaded as a file.
3. **Consistency with how the Supabase secret key is already treated.** `SUPABASE_SECRET_KEY`
   bypasses RLS — it's already the most sensitive value in this project. Splitting "own
   infrastructure" credentials (kept local, since they're meaningless without this exact
   codebase) from "external paid API" credentials (kept in the provider's secret store,
   since leaking them costs the account money directly) is a defensible security
   boundary, not just tidiness.

## Where it actually lives

Set via the Supabase CLI or dashboard as a project secret (`supabase secrets set
OPENAI_API_KEY=...`), available to Edge Functions / server-side code at runtime through
`Deno.env.get('OPENAI_API_KEY')` (or the Node backend equivalent, reading it from the
Supabase-managed environment rather than a checked-in file). It is **not** duplicated
into `.env` or `.env.supabase.local` — those two files stay scoped to Supabase's own
connection details only.

Configured server secrets used by the runtime:

- `OPENAI_API_KEY` — chat completion and voice-note transcription.
- `TWILIO_AUTH_TOKEN` — webhook HMAC validation and authenticated media download.
- `AGENT_READER_DSN` — SELECT-only database connection.
- `RATE_LIMIT_SALT` — one-way hashing for anonymous rate-limit buckets.
- `ALLOWED_ORIGINS` — optional web-channel CORS allowlist.

## What this means practically

- The local dev machine never needs the OpenAI key on disk in plaintext for longer than
  the one CLI command that sets it.
- Nothing in this repo's git history, `.gitignore`'d or not, can ever contain it.
- If the submission is a zipped copy of this folder, the OpenAI key cannot be in it —
  by construction, not by remembering to scrub it before zipping.
- Voice media is fetched directly from Twilio inside the Edge Function, transcribed, and
  discarded. Neither the audio nor the sender's raw phone number is stored by this app.
