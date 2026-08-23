# Talking Points — Decisions to Be Ready to Defend

Running list of choices made during this build that aren't obvious from the code, kept
here so they can be explained out loud in a follow-up conversation without re-deriving
the reasoning from scratch.

## 1. Why Supabase / Postgres, and not just files or SQLite

The assignment doesn't mention any specific DB. Chosen because: (a) a cloud Postgres
instance is what was available/connected in this environment, (b) it lets the scoring
step and the agent's tool-calls be genuinely separate processes reading the same
materialized table, which matters for the "deterministic scoring, not just LLM output"
requirement — the agent reads pre-computed numbers, it never invents them at chat time.
A SQLite/local-file version would have worked too and been *faster to build*; Supabase
was picked because cloud was preferred over local for this exercise.

## 2. Why us-east-1 (North Virginia) as the region

The data domain (BTS/FAA) and the business use case (US airport investment) are both
US-centric. Region should track the data source and target market, not the developer's
own location (Israel) — that only affects dev-time query latency, not the architecture.
Full writeup: `docs/02-database-schema.md`, "Region choice" section.

## 3. Why three separate public sources instead of one

No single free API covers volume + congestion + forecast. BTS T-100 gives volume/pax,
BTS On-Time gives congestion (delay/taxi-out/cancellations), FAA TAF gives forecast
growth. Verified all three are keyless and reachable before writing any schema —
see `docs/01-data-feasibility-spike.md`. Be ready to name the three sources and what
each one uniquely contributes; don't blur them into "aviation data" generically.

## 4. Why Capacity Pressure and Unmet Demand are two separate KPIs

Risk flagged explicitly (by the user, prompted by a second opinion from another model):
that these two could collapse into the same number under two names. Resolved by making
Unmet Demand a *function of* Capacity Pressure (`gap × pressure`), not an independently
computed twin. Be ready to explain: high forecast growth + low current congestion =
healthy growth, not unmet demand; high growth + high congestion = the real investment
signal. Full formulas: `docs/03-scoring-methodology.md`.

## 5. Why the scoring weights (0.4/0.35/0.25, 0.5/0.3/0.2) have no empirical basis

Asked directly, answered honestly: these are a judgment-call heuristic, not fitted to
data, not benchmarked. Checked what the industry actually does (FAA AC 150/5060-5 uses
separate throughput/demand/delay criteria, not a single weighted composite; ACRP
explicitly notes that without a standardized model, prioritization defaults to bias).
**Decision made**: keep a single composite score (the assignment requires "rank or
compare"), but always surface the component breakdown and label the weights as an
explicit, stated assumption — never presented as an industry standard. Do not claim
these weights are validated; say plainly they're a chosen heuristic and explain why each
one was picked (see doc 03, section 1).

## 6. Why no capacity/runway/gate dataset — "unmet demand" is a modeled proxy, not a fact

No public dataset publishes declared runway/terminal/gate capacity per airport at the
granularity needed. Confirmed by direct search during stage 1, not assumed. Both
Capacity Pressure and Unmet Demand are therefore built entirely from delay/taxi/forecast
data — proxies, stated as such every time the agent discusses them. This is one of the
most important scoping caveats to say out loud in the demo, not bury in a doc.

## 7. Known scope gaps to state proactively, not wait to be asked

- BTS On-Time Performance is US-domestic-only, reporting carriers only — international
  legs at SFO/LAX are invisible there (T-100 fills that gap).
- FAA TAF is annual, current only through FY2024 actuals in this vintage.
- Long-haul threshold (2000 mi) is our own definition, not a BTS/FAA standard.
- Scores are relative to whatever comparison set they were computed against (e.g. the
  airport's US Census region) — not an absolute industry scale, and not comparable across
  regions.

## 8. Stack: Vite + React + Node (not Next.js)

Chosen to match the Lovable-style stack (Vite/Node/React) rather than Next.js. Concretely:
React SPA built with Vite for the chat UI, a Node backend for the agent/tool-call layer
and any server-only Supabase access. This matters for naming: Vite only exposes
`VITE_`-prefixed env vars to client-side code, not `NEXT_PUBLIC_` (a Next.js convention
that would silently do nothing in a Vite build). `.env` was corrected accordingly —
`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` for the browser, `SUPABASE_SECRET_KEY`
and the DB URL unprefixed and server-only, never imported into React/Vite code.

This was a naming/stack decision recorded ahead of building it; the frontend was later built
on this stack — see `docs/10-frontend-architecture.md`.

## 9. Why the supplied design mock was not copied literally

A Claude Design file was provided for the UI. Its visual system was adopted in full —
palette (#EFECE4 / #16202B / #B45309), the Instrument Sans + IBM Plex Mono pairing, the
two-pane 1fr/496px layout, rank rows with score bars, accent-tagged caveats.

What was dropped: the mock ships **44 airports of fabricated demo data** and a different
five-factor weight model (capacity .26, delay .20, growth .18, TAF .20, unmet .16). Both
were replaced with the five real airports and the actual weights from `scripts/score.mjs`.

Be ready to say why plainly: shipping an investment-screening tool with plausible-looking
invented numbers is the single error that would matter most in this domain. A reviewer
who spot-checked one figure against BTS and found it fictional would rightly discard the
whole thing. The mock is a design artifact, not a data source.

## 10. Why three edge functions and one shared agent

`agent-chat` (LLM + tools) and `airport-data` (plain REST, no LLM) are separate because the
analysis panel must render deterministic scores exactly as computed, with no model in the
path. They share `_shared/db.ts`, so both execute the *same* query — the panel and the
agent cannot drift or disagree about what a score is. The scoring weights are also served
from the backend rather than hardcoded in the UI, so a weight change can't leave the panel
displaying a stale figure.

`twilio-whatsapp` is a third function because Twilio has a different boundary contract:
form-encoded webhooks, HMAC signature validation, TwiML replies, media downloads, and a
1,600-character message limit. It is an adapter, not a second agent. Both conversation
functions call `_shared/agent.ts`, so prompt, catalog, tools, cost limits, and answer style
remain identical. This separation keeps channel-specific security out of the web endpoint
without duplicating reasoning logic.
