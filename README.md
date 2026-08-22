# Airport Investment Intelligence Agent

An AI agent for screening US airports for modernization opportunities using public BTS and
FAA data. Ranking is deterministic code; the LLM explains and compares, it never computes
the numbers. This is not a profitability, ROI, or payback model because project-cost and
revenue inputs are outside the dataset.

**[Open the live app](https://airport-investment-intelligence.vercel.app)**

**→ [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — scoring methodology, key tradeoffs, and where AI
is used. Start there. The same document as a formatted page:
**[docs/architecture.html](docs/architecture.html)**.

**→ [docs/SUBMISSION.md](docs/SUBMISSION.md)** — one-page submission summary: deliverable map,
KPIs, interfaces, and stated limits.

**→ [docs/11-review-remediation.md](docs/11-review-remediation.md)** — review findings,
fixes, corrected scores, and verification record.

The interface is two panes: conversational chat on the left, and a deterministic analysis
panel on the right showing the ranked candidates, each score's components, the model
weights, and the standing assumptions.

## Quick start

```bash
npm install
npm run dev
```

Opens at http://localhost:5173. The database is populated and both Supabase Edge Functions
are deployed, so the app works immediately.

Requires a `.env` at the project root:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

The OpenAI key and the database connection string are **not** here — they live in Supabase
secrets and are readable only server-side inside the edge functions. See
[`docs/08-secrets-management.md`](docs/08-secrets-management.md).

## What it answers

The four questions from the brief, all verified end to end:

- Which airports in New England are strong candidates for terminal expansion?
- Compare LA and Santa Ana airport congestion levels.
- What is the percentage of long haul flights out of Anchorage airport?
- What is the unmet flight demand in SFO airport and why?

Follow-up questions work — the agent resolves references to earlier turns.

## WhatsApp demo

The header's **WhatsApp** button opens a QR code and deep link for the Twilio WhatsApp
Sandbox. Send the prepared join message, then ask the same airport questions by text or
voice note in WhatsApp. Voice audio is downloaded server-side from Twilio, capped at 10 MB,
transcribed without being stored, and passed to the same agent as ordinary text.
Both channels use the same agent engine, prompt, deterministic tools, limits, and caveats.

The Sandbox is a reviewer demo, not a production WhatsApp sender. Twilio may expire the
session and does not guarantee international delivery. The webhook verifies
`X-Twilio-Signature`, rate-limits a one-way hash of the sender, and keeps the Auth Token in
Supabase secrets. WhatsApp turns are stateless in this one-day prototype; conversational
follow-ups remain fully supported in the web chat.

## Layout

```
.github/workflows/       scheduled daily + annual data refresh
docs/                    stage-by-stage build log, 00–10
  ARCHITECTURE.md        the design document (read this first)
  DATA_PLAN.md           endpoint-level map of the three data sources
src/                     Vite + React + TypeScript UI
supabase/
  schema.sql             4-table schema
  functions/
    _shared/db.ts        every database read, one definition
    _shared/agent.ts     shared LLM/tool loop for every conversation channel
    agent-chat/          LLM + 2 typed tools and metric catalog
    twilio-whatsapp/     signed text + voice-note WhatsApp adapter
    airport-data/        deterministic scores for the UI panel (no LLM)
scripts/
  test-*                 stage-1 source verification probes
  ingest.mjs             load sources into Supabase
  score.mjs              deterministic scoring → airport_scores
data/out/                verified sample outputs
```

## Rebuilding the data

```bash
node scripts/test-bts-ontime.mjs 2026 5   # ~31 MB download, streams a 277 MB CSV
python3 scripts/parse-faa-taf-full.py
node scripts/ingest.mjs 2025
node scripts/score.mjs
```

Ingestion upserts on primary key, so re-running is safe.

This also runs on a schedule: `.github/workflows/refresh-daily.yml` checks daily and fetches any newly
published BTS month, re-ingests, re-scores, and commits the new aggregate;
`refresh-annual.yml` does the same for the FAA TAF vintage.

**Before either can run**, add two repository secrets in GitHub under
**Settings → Secrets and variables → Actions**: `VITE_SUPABASE_URL` and
`SUPABASE_SECRET_KEY` (the `sb_secret_...` key, since ingestion writes — not the
publishable one). Without them every run fails on `Missing VITE_SUPABASE_URL or
SUPABASE_SECRET_KEY`. See
[`docs/06-refresh-cadence-and-automation.md`](docs/06-refresh-cadence-and-automation.md),
which also covers why Supabase Cron cannot run this pipeline.

## Scope

358 covered airports, 163 scored across 9 regional comparison sets, thirteen months of
congestion data (June 2025 – June 2026) as of 2026-08-22, no capacity dataset in existence
anywhere public. The counts grow as the refresh cron ingests new BTS months; the app and
the agent read the current period from the database rather than asserting a fixed one. Scores are relative to an airport's
own region and are not comparable across regions, and the scoring weights are a stated
heuristic rather than an industry standard. These limits are surfaced
in the UI and volunteered by the agent — see
[docs/ARCHITECTURE.md §06](docs/ARCHITECTURE.md#06-assumptions-uncertainty-and-scoping).
