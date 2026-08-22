# Airport Investment Intelligence Agent — Submission

**Submitted by:** Itay Karkason ([itayk93@gmail.com](mailto:itayk93@gmail.com))

**Live app:** https://airport-investment-intelligence.vercel.app
**Source:** https://github.com/itayk93/airport-investment-intelligence

## Where to look

| Deliverable | File |
|---|---|
| Design / architecture doc | [`ARCHITECTURE.md`](ARCHITECTURE.md) — scoring methodology, tradeoffs, where AI is used |
| Entry point / how to run | [`README.md`](../README.md) |
| Deterministic scoring | [`scripts/score.mjs`](../scripts/score.mjs), [`scripts/lib/scoring.mjs`](../scripts/lib/scoring.mjs), tests in [`tests/scoring.test.mjs`](../tests/scoring.test.mjs) |
| Agent (LLM + typed tools) | [`supabase/functions/_shared/agent.ts`](../supabase/functions/_shared/agent.ts), [`supabase/functions/agent-chat/`](../supabase/functions/agent-chat) |
| Data source map | [`DATA_PLAN.md`](DATA_PLAN.md) |
| Build log, stage by stage | [`docs/00-overview.md`](00-overview.md) → `docs/15-*` |

## What it is

An agent that screens US airports for modernization opportunity using only public BTS and
FAA data. **All ranking numbers come from deterministic code**, not from the model. The LLM
routes the question, calls two typed read-only tools, and explains the result in words; it
never computes a score.

Two KPIs, kept structurally separate:

- **Capacity Pressure** — current strain: taxi-out (0.40), NAS delay per departure (0.35),
  % flights delayed >15 min (0.25), min-max normalised across the comparison set.
  *In plain words: how jammed the airport is right now, from three real delay signals — how
  long planes wait on the taxiway, how much of their delay is air-traffic-control-caused, and
  how often flights run more than 15 minutes late. Each airport is scored against the others
  in its comparison set, not against a fixed target.*
- **Unmet Demand** — `max(0, FAA TAF forecast CAGR − BTS measured CAGR) × CapacityPressure`.
  The gating is deliberate: forecast growth at an *uncongested* airport is headroom, not
  unmet demand.
  *In plain words: take how much faster the FAA expects the airport to grow than it has
  actually been growing — that gap is unused potential. But it only counts as "unmet demand"
  if the airport is already congested; if there's no current strain, extra growth is just
  room to expand, not evidence that expansion is needed.*
- **Expansion Score** = `0.50·UnmetDemand + 0.30·norm(TAF CAGR) + 0.20·CapacityPressure`.
  *In plain words: the final ranking number. Half the weight is unmet demand (the strongest
  signal), 30% is raw forecast growth (so airports still headed for big growth aren't missed
  even before congestion catches up), and 20% is current congestion on its own (so a badly
  strained airport still ranks even with modest growth forecasts).*

Full derivation and rationale in `ARCHITECTURE.md §03`.

## Interfaces

- Web: two panes — chat on the left, deterministic analysis panel on the right showing each
  score's components, the weights, and the standing assumptions.
- Voice: browser speech input in the web chat.
- WhatsApp (bonus): Twilio Sandbox, text and voice notes, same agent engine and same tools.

## The four brief questions

All four run end to end in the live app, with conversational follow-up (the agent resolves
references to earlier turns).

## Stated limits

- **358 covered airports, 163 scored**, and thirteen months of on-time data (June 2025 – June 2026)
  as of 2026-08-22; the refresh cron moves these, and the app derives them live. Scores are *relative
  to the airport's own US Census region*, not absolute and not comparable across regions.
  Airports under 300 departures/month are covered but not ranked — see
  [`docs/14-coverage-expansion.md`](14-coverage-expansion.md).
- **The weights are a reasoned heuristic**, not fitted to data. No public ground-truth
  dataset of successful vs. failed expansions exists to calibrate against, and no industry
  standard composite exists to borrow — see `ARCHITECTURE.md §03`.
- **This is not an ROI, payback, or profitability model.** Project cost and revenue inputs
  are outside any public aviation dataset. It ranks *where demand pressure is highest*,
  which is an input to an investment decision, not the decision.
- No public airport *capacity* (declared throughput) dataset exists; capacity is proxied by
  congestion signals.
  *In plain words: no government source publishes "this airport can handle N flights/hour."
  So instead of measuring capacity directly, we infer it from how strained the airport
  already looks — delays, taxi time — as a stand-in.*

These limits are surfaced in the UI and volunteered by the agent unprompted, rather than
being buried here.
