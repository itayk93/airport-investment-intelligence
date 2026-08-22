# Airport Investment Intelligence Agent

An AI agent for identifying US airports where modernization investment is most likely to
pay back, built on public BTS and FAA data. Ranking is deterministic code; the LLM explains
and compares, it never computes the numbers.

**[Open the live app](https://airport-investment-intelligence.vercel.app)**

**→ [ARCHITECTURE.md](ARCHITECTURE.md)** — scoring methodology, key tradeoffs, and where AI
is used. Start there.

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

## Layout

```
ARCHITECTURE.md          the design document (read this first)
DATA_PLAN.md             endpoint-level map of the three data sources
docs/                    stage-by-stage build log, 00–10
src/                     Vite + React + TypeScript UI
supabase/
  schema.sql             4-table schema
  functions/
    _shared/db.ts        every database read, one definition
    agent-chat/          LLM + 4 typed tools
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

## Scope

Five airports (SFO, LAX, SNA, ANC, BOS), one month of congestion data, no capacity dataset
in existence anywhere public. Scores are relative to this comparison set, and the scoring
weights are a stated heuristic rather than an industry standard. These limits are surfaced
in the UI and volunteered by the agent — see
[ARCHITECTURE.md §5](ARCHITECTURE.md#5-scope-uncertainty-and-what-this-does-not-do).
