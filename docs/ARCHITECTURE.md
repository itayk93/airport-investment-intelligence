# Airport Investment Intelligence Agent — Design & Architecture

Screens US airports for modernization opportunity using only public BTS and FAA data.
**Ranking is deterministic code; the language model explains and compares, it never
computes.**

358 airports covered · 163 scored · 9 regional sets · 13 months of congestion data

---

## 01. Four layers, one source of truth

```
  PUBLIC SOURCES              INGEST & SCORE            SUPABASE              USAGE CHANNELS
  ─────────────────           ────────────────          ─────────────         ──────────────
  BTS T-100 · BTS On-Time  ─▶  Node/Python ·        ─▶  Postgres ·        ─▶  React Web ·
  FAA TAF                      deterministic             Edge Functions ·      WhatsApp
                                computation               read-only role
```

Both edge functions read through **one shared query module**,
`supabase/functions/_shared/db.ts`. The analysis panel and the agent execute the same
query, so they cannot show different definitions for the same score.

| Layer | Stack |
|---|---|
| Frontend | Vite + React + TypeScript strict. Two-pane desktop UI, bottom analysis sheet on mobile. |
| Backend | Supabase Postgres + Deno Edge Functions. Three functions: data, chat, and WhatsApp. |
| AI | OpenAI `gpt-5-mini`, low reasoning effort, with two typed tools and a bounded loop. |
| Pipeline | Node and Python scripts for loading, cleaning, aggregation, and precomputed scoring. |

---

## 02. The four questions, answered

All four run end to end in the live app, with conversational follow-up. Figures below were
read from the deployed API on 2026-08-22.

| Question | How the system answers it |
|---|---|
| Strong candidates in New England | Ranks all 7 scored New England airports in one call. **BTV (Burlington) leads at 0.84**, then BGR and BOS. |
| LA vs. Santa Ana congestion | Compares **raw metrics**, not scores — LAX capacity pressure 0.62 vs. SNA 0.60, decided on taxi-out and NAS delay minutes. |
| Long-haul share out of Anchorage | **28.77%** of departures fly 2,000+ miles — with the caveat that the 2,000-mile threshold is our definition, not a BTS standard. |
| Unmet demand at SFO, and why | **1.00** — capacity pressure 0.85 combined with a forecast growth gap of +2.07pp. The explanation is the product: growth arriving at an already-strained airport. |

---

## 03. Scoring methodology

Every metric traces to a real, keyless public source. Nothing is synthetic.

| Source | Provides | Grain |
|---|---|---|
| BTS T-100 (Socrata API) | passengers, departures, seats, domestic/intl split | monthly per airport |
| BTS On-Time (TranStats ZIP) | delay, taxi-out, cancellations, NAS delay, distance | per flight → monthly |
| FAA Terminal Area Forecast | enplanement and operations forecasts to FY2055 | annual per airport |

### Two KPIs, kept structurally separate

The central design risk was that "capacity pressure" and "unmet demand" collapse into the
same number wearing two names. One measures *current state*; the other measures a
*forecast-vs-reality gap* **gated by** the first.

**Capacity Pressure** — how strained an airport is now, relative to its region. Min-max
normalised within the comparison set:

```
CapacityPressure = 0.40 · norm(avg taxi-out minutes)
                 + 0.35 · norm(NAS delay minutes per departure)
                 + 0.25 · norm(% flights delayed > 15 min)
```

Taxi-out is weighted highest as the most direct physical congestion signal. NAS delay is
second because it is delay attributable to the *air-traffic system* — the component tied to
infrastructure rather than to one airline's operations. Weather delay and carrier delay are
deliberately excluded: they do not describe the airport.

**Forecast Growth Gap** — does demand outrun what the airport has historically delivered?

```
GrowthGap (pp) = FAA TAF enplanement CAGR (FY2024→FY2035)
               − BTS T-100 measured CAGR   (2014→2024)
```

Historical growth is measured from **BTS**, not from the FAA's own historical estimate, so
this compares a forecast against an independent source's actuals rather than the FAA against
itself.

**Unmet Demand** — the two multiplied, then normalised:

```
UnmetDemandRaw = max(0, GrowthGap) × CapacityPressure
UnmetDemand    = norm(UnmetDemandRaw)
```

> **Why multiply rather than add.** High forecast growth at an *uncongested* airport is
> healthy growth with headroom, not unmet demand. Only growth arriving at an
> already-strained airport counts. Computed independently and averaged, the two KPIs would
> be correlated restatements of each other.

**Expansion Score** — the ranking KPI:

```
ExpansionScore = 0.50 · UnmetDemand
               + 0.30 · norm(TAF CAGR)
               + 0.20 · CapacityPressure
```

### Results, and the two rows that prove the gating works

**Scores are normalised within each region, so the expansion score is comparable down a
region and never across one** — SFO and BTV each top their own scale.

| Airport | Region | Capacity pressure | Growth gap | Unmet demand | Expansion score |
|---|---|---|---|---|---|
| SFO | Pacific | 0.85 | +2.07 | 1.00 | **0.89** |
| BTV | New England | 0.86 | +1.71 | 1.00 | **0.84** |
| LAX | Pacific | 0.62 | +1.15 | 0.41 | **0.46** |
| SNA | Pacific | 0.60 | +0.12 | 0.04 | **0.24** |
| BOS | New England | 0.66 | −0.91 | 0.00 | **0.23** |
| MHT | New England | 0.01 | +6.80 | 0.03 | **0.07** |

- **BOS — congestion without growth.** Mid-range pressure (0.66), yet unmet demand is
  exactly zero: the FAA forecasts it growing more slowly than its own measured trend, so the
  `max(0, …)` clamps. Crowded, but not growing.
- **MHT — growth without congestion.** By far the largest growth gap in New England
  (+6.80pp) and still second-to-last of seven, because its capacity pressure is 0.01. Fast
  growth into an empty airport is headroom, not unmet demand.

Neither result would fall out of a model that simply averaged congestion and growth. That is
the entire argument for the gating.

> **The weights have no empirical basis, and that is stated.** They are a reasoned
> heuristic, not fitted to data. There is no ground truth to calibrate against — no public
> dataset labels expansion projects as successful or failed — and no standard composite to
> borrow: FAA Advisory Circular 150/5060-5 uses separate throughput, demand and delay
> criteria rather than one weighted score. The response was not to hide this behind one
> opaque number: the component breakdown is always shown beside the score, and the UI
> carries the standing caveats.

---

## 04. Where and how AI is used

| Layer | Who does it | Why |
|---|---|---|
| Scoring, ranking, normalisation | **Deterministic code** (`scripts/score.mjs`) | Auditable, identical every run, no model variance |
| Data retrieval | **Typed tools** over a read-only role | No free-form SQL for the model to write |
| Interpretation, comparison, follow-up | **LLM** (`gpt-5-mini`) | Genuinely language work |

The model is an **explainer over fixed numbers**. Its instructions state that it does not
calculate scores and must never present a figure it did not retrieve from a tool.

### Three layers that enforce it, rather than trusting the prompt

1. **The first model round is forced to call a tool** — in code, not by instruction. Prompt
   compliance is backed by a runtime control.
2. **Typed, allowlisted tools over a SELECT-only role.** `list_airports` resolves coverage
   and ranks a region — each row carries that airport's scores, so a regional ranking is one
   call over the complete set rather than a fan-out the model assembles itself.
   `get_airport_data` retrieves any allowlisted metric through fixed parameterised queries.
   There is no SQL string for an injection payload to reach.
3. **The screening disclosure is appended in code** whenever the tool trace shows score data
   was used — once per conversation, and a model-written restatement of it is stripped in
   code. A disclosure that depends on the model remembering disappears the moment it
   summarises; one repeated under every message becomes wallpaper.

### Answers explain, they do not list

A ranking of bare scores is not an answer: a reader cannot act on "0.72" without knowing
what the scale means. The agent must anchor a score the first time it uses one, explain why
an airport landed where it did rather than reciting what the metric contains, and name the
counterintuitive result out loud when a small airport outranks a major hub. **Scores are
rounded to two decimals in the tool layer**, so the false precision of a modeled proxy is
never available to quote.

**Bounded loop, not ReAct.** The question space is narrow — rank, compare and explain over
four small tables — so a planner or reflection loop would add latency and cost without
changing answers. The loop caps at four tool rounds in code and says so honestly on
exhaustion. Every assignment question resolved in one to two rounds.

---

## 05. Key tradeoffs

**Coverage from the source, not from a list.** The build started with five hand-picked
airports. That was wrong in a way worth naming: asked "which airport in New England is the
strongest candidate", a one-airport region always returns that airport. **The ranking looks
complete and the conclusion was decided the moment someone chose the list.** Coverage is now
every airport BTS reports departures from. The real leader, Burlington, was invisible to the
earlier version; Boston, the only airport it did see, places third.

**A full annual cycle, not a representative month.** The first version scored one month and
documented that as a limitation. Backfilling reversed the headline result — New England's
top candidate changed from MHT to BTV, and MHT fell to the bottom. One month cannot separate
a congested airport from an airport having a bad month. It also exposed a weakness the
single month had hidden, now the model's most important caveat: **winter taxi-out includes
de-icing**.

**Regional comparison sets, not one national ranking.** Min-max normalisation is relative by
construction, so a national set would let the busiest and quietest US airports define the
endpoints and compress every regional difference toward zero. Ranking within a US Census
division also matches the question being asked. **Cost: scores are not comparable across
regions** — stated in the prompt, the panel, and the caveats.

**A sample floor that costs coverage.** An earlier floor of 100 departures/month let an
airport with 134 departures rank fourth in a 37-airport region on a single bad month. At
300/month (~10 per day) one disrupted day is at most ~3% of the sample. Scored coverage
dropped from 221 to 163: **fewer airports, better ranking**.

**Typed tools over a general SQL tool.** A general query tool would answer more questions.
It would also hand a language model arbitrary SQL. The smaller, safer surface was chosen;
the retrieval contract is generalised through a metric dictionary instead, so new questions
do not need a new function.

**Scores materialised, not computed on read.** Scoring runs as a batch step and writes to a
table; the agent only ever reads. This keeps determinism outside the LLM loop. Cost: scores
go stale until re-run — which is why a scheduled job now checks daily for newly published
BTS data and re-scores when it arrives.

---

## 06. Assumptions, uncertainty and scoping

- **This is not a profitability, ROI or payback model.** Project cost, incremental revenue,
  financing, land constraints and terminal capacity are not inputs. It ranks where demand
  pressure is highest. Confidence is **low-to-moderate for screening and insufficient for an
  investment decision**.
- **No public dataset publishes runway, gate or terminal capacity.** Capacity Pressure and
  Unmet Demand are modeled proxies from delay and forecast data — never presented as
  published capacity figures.
- **Scores are relative to an airport's own region**, never national and never absolute.
  1.00 means "most pressured in that region". Cross-region comparison must use the
  underlying metrics.
- **163 of 358 covered airports are scored.** 191 fall below the sample floor, 2 have no FAA
  forecast, and 2 sit in a region with too few scoreable peers. Each is reported as covered
  but unranked *with its reason*, rather than scored from a sample too small to mean
  anything.
- **Winter taxi-out includes de-icing, and the model cannot separate it.** BTV averages over
  30 minutes of taxi-out in December and under 18 in summer, which lifts northern airports
  for a reason that is weather rather than saturation — and a terminal does not fix weather.
  This is the most important caveat on the current numbers, and the agent raises it whenever
  a northern airport ranks high.
- **Congestion data is US-domestic only** (BTS reporting carriers). International departures
  at SFO and LAX are absent from the delay figures.
- **13 months of congestion data** (June 2025 – June 2026). More than a full annual cycle,
  so no season is missing — but it establishes a level, not a trend.
- **The 2,000-mile long-haul threshold is our definition**, not a BTS or FAA standard.
  Growth-gap spans differ in length (10y actual vs 11y forecast) because T-100 only reaches
  back to 2014.

---

## 07. Against the brief

- ✓ **Use public APIs** — BTS T-100, BTS On-Time Performance, FAA Terminal Area Forecast. No
  keys, no paid sources, nothing synthetic.
- ✓ **Rank or compare on a defined KPI** — two structurally distinct KPIs, one gating the
  other.
- ✓ **Deterministic scoring, not only LLM output** — `scripts/score.mjs` computes; the agent
  only reads. This is the central requirement and the central design decision.
- ✓ **Explain its reasoning** — the analysis panel shows every score's components, the model
  weights and the standing assumptions, from the same query the agent uses.
- ✓ **Conversational follow-up** — the agent receives full history and resolves references
  to earlier turns.
- ✓ **Chat interface** — two-pane web app: conversation on one side, deterministic analysis
  on the other.
- ✓ **Voice (bonus)** — browser speech recognition in the web app, and voice notes over a
  WhatsApp channel that shares one agent engine, so prompt, tools and caveats cannot drift
  between channels.
- ✓ **Communicate assumption, uncertainty and scoping** — a code-appended disclosure,
  standing caveats in the panel, and an explicit reason attached to every covered-but-unranked
  airport.

---

Figures read from the deployed API on 2026-08-22. Coverage moves as the scheduled refresh
ingests new BTS months; the app derives the current numbers from the database rather than
quoting a constant. Formatted page: [docs/architecture.html](architecture.html).
