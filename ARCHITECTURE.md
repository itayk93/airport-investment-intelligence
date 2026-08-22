# Airport Investment Intelligence Agent — Design & Architecture

An AI agent that helps analysts identify US airports where modernization investment is most
likely to pay back, using only public BTS and FAA data. Scoring is deterministic code; the
LLM explains and compares, it never computes.

**Pilot set:** SFO, LAX, SNA, ANC, BOS. Five airports, deliberately — see
[Scope & honesty](#scope-uncertainty-and-what-this-does-not-do).

---

## 1. System shape

```
  PUBLIC SOURCES              INGEST + SCORE            SERVE                 UI
  ─────────────────           ────────────────          ─────────────         ──────────────
  BTS T-100      (API)  ─┐                          ┌── airport-data ────┐
  BTS On-Time    (ZIP)  ─┼─▶ scripts/ingest.mjs ─▶  │   (no LLM)         ├─▶ Vite + React
  FAA TAF        (ZIP)  ─┘        │                 │                    │   two-pane app
                                  ▼                 │                    │
                          Supabase Postgres  ──────▶┤                    │
                          4 tables                  │                    │
                                  ▲                 └── shared agent ────┬─▶ Web chat
                          scripts/score.mjs             (OpenAI + 2 tools)└─▶ WhatsApp
                          deterministic KPIs
```

Both edge functions read through **one shared query module** (`_shared/db.ts`) as a
SELECT-only Postgres role. The analysis panel and the agent therefore execute the *same*
query — they cannot drift or disagree about what a score is.

**Stack:** Vite + React + TypeScript (strict) · Supabase Postgres + Edge Functions (Deno) ·
OpenAI `gpt-4o-mini` · Node/Python scripts for ingestion and scoring.

---

## 2. Scoring methodology

Every metric traces to a real, keyless public source. Nothing is synthetic.

| Source | What it provides | Grain |
|---|---|---|
| BTS T-100 (Socrata API, `r495-tyji`) | passengers, departures, seats, domestic/intl split | monthly per airport |
| BTS On-Time Performance (TranStats ZIP, ~611k flight rows/month) | delay, taxi-out, cancellations, NAS delay, flight distance | per flight → aggregated monthly |
| FAA Terminal Area Forecast (`APO100_TAF_Final_2025.zip`) | enplanement + operations forecasts to FY2055 | annual per airport |

### The two KPIs, and why they are separate

The central design risk was that "capacity pressure" and "unmet demand" collapse into the
same number wearing two names. They are kept structurally distinct: one measures *current
state*, the other measures a *forecast-vs-reality gap* **gated by** the first.

**Capacity Pressure** — how strained an airport is *now*, relative to the comparison set.
Built only from On-Time data, min-max normalised across the set:

```
CapacityPressure = 0.40·norm(avg taxi-out minutes)
                 + 0.35·norm(NAS delay minutes per departure)
                 + 0.25·norm(% flights delayed >15 min)
```

Taxi-out is weighted highest as the most direct physical congestion signal. NAS delay is
second because it is the delay attributable to the *air-traffic system* — the component
actually tied to infrastructure, rather than one airline's operational problems.

**Forecast Growth Gap** — does demand outrun what the airport has historically delivered?

```
GrowthGap(pp) = FAA TAF enplanement CAGR (FY2024→FY2035)
              − BTS T-100 measured CAGR   (2014→2024)
```

Historical growth is measured from **BTS**, not from FAA's own historical estimate, so the
comparison is FAA-forecast vs. an independent source's actuals rather than FAA vs. FAA.

**Unmet Demand** — the two multiplied, then normalised:

```
UnmetDemandRaw = max(0, GrowthGap) × CapacityPressure
UnmetDemand    = norm(UnmetDemandRaw)
```

This gating is the whole point. High forecast growth at an *uncongested* airport is healthy
growth with headroom — not unmet demand. Only growth arriving at an already-strained
airport counts. Computed independently, the two KPIs would just be correlated restatements
of each other.

**Expansion Score** — the ranking KPI:

```
ExpansionScore = 0.50·UnmetDemand + 0.30·norm(TAF CAGR) + 0.20·CapacityPressure
```

### Results (run 2026-08-22)

| Airport | Capacity pressure | Growth gap (pp) | Unmet demand | **Expansion score** |
|---|---|---|---|---|
| SFO | 1.00 | +2.07 | 1.00 | **1.00** |
| LAX | 0.46 | +1.15 | 0.26 | **0.30** |
| BOS | 0.63 | −0.91 | 0.00 | **0.26** |
| SNA | 0.52 | +0.12 | 0.03 | **0.12** |
| ANC | 0.00 | +0.52 | 0.00 | **0.05** |

SFO leads on every axis — the only airport where current strain and forecast growth point
the same way at once. BOS is the clearest demonstration that the gating works: the FAA
forecasts it growing *slower* than its own measured trend, so despite mid-range congestion
its unmet demand floors at zero. ANC also floors at zero because its capacity pressure is
zero; healthy forecast growth with current headroom is not labeled unmet demand.

### The weights have no empirical basis, and that is stated

They are a reasoned heuristic, not fitted to data and not benchmarked. A check of prior art
found no standard to borrow: FAA Advisory Circular 150/5060-5 uses separate
throughput/demand/delay criteria rather than one weighted composite, and ACRP notes that
without a standardised model, prioritisation defaults to bias. There is also no ground
truth (no public dataset of expansion projects labelled successful or failed) to calibrate
against.

The response was **not** to hide this behind a single opaque number. A composite score is
kept because the assignment asks the agent to *rank*, but the component breakdown is always
shown beside it. The UI panel displays the standing caveats, and the API appends a fixed
screening disclosure to every answer that uses score data instead of relying on model
compliance alone.

---

## 3. Where and how AI is used

| Layer | Who does it | Why |
|---|---|---|
| Scoring, ranking, normalisation | **Deterministic code** (`scripts/score.mjs`) | Auditable, identical on every run, no model variance |
| Data retrieval | **Typed tools** over a read-only role | No free-form SQL for the model to write |
| Interpretation, comparison, explanation, follow-up | **LLM** (`gpt-4o-mini`, temp 0.2) | Genuinely language work |

The LLM is an **explainer over fixed numbers**. Its system prompt states: *"You do NOT
calculate scores yourself… Never invent a figure you did not retrieve from a tool."* The
first model round is forced to call a tool, so prompt compliance is backed by a runtime
control. Tool traces remain available in the API for operations but are intentionally not
shown in the end-user chat.

**Two tools:** `list_airports` resolves coverage; `get_airport_data` retrieves any
allowlisted score, monthly BTS metric, traffic-volume metric, or FAA forecast. It accepts
airports, canonical metrics, an optional period, and an optional scope. One data dictionary
maps every canonical metric to a fixed field, source, unit, and valid scope. Unknown or
incompatible requests return `available_metrics` for discovery before the model may claim
that evidence is unavailable. This supports new questions without adding a function or a
prompt exception per question.

The model chooses semantic fields, never SQL. Results carry the period plus source, scope,
and unit metadata, so caveats travel *with the facts* into the model context.

**Bounded loop, not ReAct.** The question space is narrow — rank, compare, explain over
four small tables. A planner/executor or reflection loop would add latency and cost without
changing answers. The loop caps at 4 tool rounds **in code, not in the prompt**, and on
exhaustion says so honestly rather than truncating silently. In testing every assignment
question resolved in 1–2 rounds.

### Security

1. **Separate read-only role.** The agent connects as `agent_reader` — `SELECT` grants on
   four tables, 5s statement timeout — never the service key used for ingestion. Verified:
   `DELETE FROM airport_scores` → `permission denied`.
2. **No SQL surface.** Tools take typed parameters; IATA codes are regex-validated and
   capped. There is no SQL string for an injection payload to reach.
3. **Client-supplied `system`/`tool` messages are dropped.** Otherwise a caller could
   rewrite the agent's instructions or forge tool results. Verified: an injected
   `"Ignore all previous instructions"` had no effect.
4. **Secrets never reach the browser.** The OpenAI key and database DSN live in Supabase
   secrets, readable only server-side. Only the publishable key ships to the client.
5. **WhatsApp requests are authenticated.** The channel adapter validates Twilio's HMAC
   signature over the exact webhook URL and form fields before invoking the agent. Sender
   numbers are never logged or sent to the model; rate limiting stores only a salted hash.
6. **Voice media stays server-side.** Only signed WhatsApp requests can trigger a download;
   media URLs must be HTTPS on `api.twilio.com` under the signed account path. Audio is
   streamed into a 10 MB bounded buffer, transcribed, and discarded rather than persisted.

---

## 4. Key tradeoffs

**Data proven before schema written.** A full day-one spike hit every endpoint by hand
before any table existed. This caught two dead ends early — the documented FAA TAF download
endpoint is broken (302 to an error page), and BTS On-Time is a 277 MB CSV that must be
streamed, not an API. Cost: a slower start. Benefit: no schema built around fields that
turn out not to exist.

**Five airports, deeply, over fifty shallowly.** One On-Time month is a 31 MB download and
a 277 MB stream. Breadth was traded for correctness and honest coverage reporting. Adding
airports is a config-list change, not a code change.

**Scores materialised, not computed on read.** Scoring runs as a batch step and writes to
`airport_scores`; the agent only ever `SELECT`s. Keeps determinism outside the LLM loop and
tool calls trivial. Cost: scores go stale until re-run.

**Typed tools over a general SQL tool.** A general query tool would answer more questions.
It would also hand a language model arbitrary SQL. Chose the smaller, safer surface.
`get_airport_data` generalizes the semantic contract, not the database permissions: metric
names are allowlisted and still map to fixed parameterized queries.

**WhatsApp as an adapter, not a second agent.** The web endpoint and Twilio webhook call
one shared agent engine, so prompt, tools, limits, and caveats cannot drift. The Sandbox is
deliberately a reviewer demo: QR/deep-link onboarding, no approved production sender, and
stateless WhatsApp turns. Cross-channel identity or stored phone-number history would add
privacy and retention obligations that are not justified in a one-day prototype.

**No markdown library in the UI.** ~40 kB to render four constructs the design styles very
specifically. A ~90-line parser maps replies onto the design's text/bullet/note line types.
Zero runtime dependencies beyond React; 53 kB gzipped total.

**Composite score, but never shown alone.** Discussed in §2 — ranking requires one number;
honesty requires the parts.

**Browser speech recognition for voice.** No extra key, no audio upload, no per-minute
cost. Trade-off: browser-dependent support (no Firefox), which the UI reports in its hint
line rather than failing silently.

**The supplied design mock was not copied literally.** It shipped 44 airports of fabricated
demo data and a different 5-factor weight model. The visual system was adopted in full; the
fake data and mock weights were dropped for the real five airports and the real weights.
Plausible-looking invented numbers in an investment tool is the one error that would matter
most here.

---

## 5. Scope, uncertainty, and what this does not do

Stated plainly, because the assignment asks for it and because these are the questions a
reviewer should ask:

- **No public dataset publishes runway, gate, or terminal capacity** at the needed
  granularity. Capacity Pressure and Unmet Demand are *modeled proxies* from delay and
  forecast data — never presented as published capacity figures.
- **Scores are relative to the 5-airport set.** 1.00 means "most pressured of these five",
  not "at absolute capacity". Adding airports shifts every score.
- **Congestion data is US-domestic only** (BTS reporting carriers). International
  departures at SFO/LAX are absent from delay figures; T-100 covers volume including
  international.
- **One month of congestion data (May 2026) is ingested.** Trend questions cannot be
  answered yet. The app computes and displays this coverage from the database rather than
  claiming more.
- **FAA TAF is annual**, 2025 vintage, historical actuals only through FY2024.
- **The 2,000-mile long-haul threshold is our definition**, not a BTS or FAA standard.
- **Growth-gap spans differ in length** (10y historical vs 11y forecast) because T-100 only
  reaches back to 2014.
- **This is not a profitability, ROI, or payback model.** Project cost, incremental
  revenue, financing, land constraints, and terminal/gate capacity are not inputs. The
  defensible confidence level is low-to-moderate for screening and insufficient for an
  investment decision.
- **Nothing is automated.** Ingestion and scoring were run by hand. Refresh cadence and a
  proposed schedule are in `docs/06`; no cron exists.

---

## 6. Running it

```bash
npm install
npm run dev          # http://localhost:5173
```

Requires `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The database
is already populated and both edge functions are deployed.

To rebuild the data from source:

```bash
node scripts/test-bts-ontime.mjs 2026 5   # ~31 MB download, streams 277 MB CSV
python3 scripts/parse-faa-taf-full.py
node scripts/ingest.mjs 2025
node scripts/score.mjs
```

---

## 7. Deeper documentation

`docs/` is a stage-by-stage build log. Most relevant:

| Doc | Contents |
|---|---|
| `01-data-feasibility-spike.md` | Source verification, dead ends, sample outputs |
| `02-database-schema.md` | Schema design and rationale |
| `03-scoring-methodology.md` | Full formulas and derivation |
| `07-scoring-results-explained.md` | The results in plain language |
| `09-agent-architecture.md` | Tools, prompt, security, verified behaviour |
| `13-generic-airport-data-tool.md` | Generic retrieval contract, discovery, safety, and live verification |
| `10-frontend-architecture.md` | UI structure and design decisions |
| `DATA_PLAN.md` | Endpoint-level data map |
