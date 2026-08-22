# Overview — Airport Investment Intelligence Agent

This `docs/` folder is a running log of how this project was built, stage by stage,
so the process can be explained afterward — not just the final code.

**The submitted design document is [`../ARCHITECTURE.md`](../ARCHITECTURE.md)** — scoring
methodology, key tradeoffs, and where AI is used, in one self-contained read. This folder
is the supporting detail behind it.

## Assignment recap

Build an AI agent for an airport-modernization investment firm that answers questions like:

- Which airports in New England are strong candidates for terminal expansion?
- Compare LA and Santa Ana airport congestion levels.
- What is the percentage of long-haul flights out of Anchorage airport?
- What is the unmet flight demand at SFO and why?

Requirements: real public data, deterministic scoring/ranking (not just LLM output),
a chat interface, clear reasoning, and explicit assumptions/uncertainty/scoping.

## Build order (decided up front, followed in this order)

1. **Data feasibility spike** — prove every metric can actually be computed from a real,
   reachable, keyless source before writing any schema or agent code.
   → [`01-data-feasibility-spike.md`](01-data-feasibility-spike.md), and `DATA_PLAN.md` at repo root.
2. **Database schema design** — shaped by the real fields discovered in stage 1, not by
   assumption. → [`02-database-schema.md`](02-database-schema.md)
3. **Deterministic scoring methodology** — the KPI math the agent leans on before any LLM
   reasoning runs. → [`03-scoring-methodology.md`](03-scoring-methodology.md)
4. **Ingestion pipeline** — loads stage-1 sources into the stage-2 schema on Supabase.
   → [`05-ingestion-pipeline.md`](05-ingestion-pipeline.md)
5. Agent (LLM + tool calls over the deterministic scores)
6. Chat UI (Vite + React + Node — see `04-decisions-and-talking-points.md`, section 8)
7. WhatsApp channel (Twilio Sandbox QR/deep link, signed webhook, text + voice notes)

Cutting across all of these: [`04-decisions-and-talking-points.md`](04-decisions-and-talking-points.md)
is a running list of choices worth being able to explain out loud (Supabase region, stack,
scoring weights, scope gaps), and [`06-refresh-cadence-and-automation.md`](06-refresh-cadence-and-automation.md)
covers how often each source actually publishes new data and how ingestion would be
scheduled to stay current (proposed, not yet automated).

Stages 5–7 are documented in `09-agent-architecture.md`, `10-frontend-architecture.md`,
and the WhatsApp sections of `ARCHITECTURE.md` and `12-public-deployment-hardening.md`.

## Why this order

Schema-first (without proof the data exists) risks building tables around fields that
don't exist in any real source. Scoring-first (without a schema) risks hand-wavy KPIs
that can't actually be queried. Data → schema → scoring → agent → UI keeps every layer
grounded in what came before it.
