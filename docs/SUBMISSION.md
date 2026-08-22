# Airport Investment Intelligence Agent — Submission

**Live app:** https://airport-investment-intelligence.vercel.app
**Source:** https://github.com/itayk93/airport-investment-intelligence

## Where to look

| Deliverable | File |
|---|---|
| Design / architecture doc | [`ARCHITECTURE.md`](../ARCHITECTURE.md) — scoring methodology, tradeoffs, where AI is used |
| Entry point / how to run | [`README.md`](../README.md) |
| Deterministic scoring | [`scripts/score.mjs`](../scripts/score.mjs), [`scripts/lib/scoring.mjs`](../scripts/lib/scoring.mjs), tests in [`tests/scoring.test.mjs`](../tests/scoring.test.mjs) |
| Agent (LLM + typed tools) | [`supabase/functions/_shared/agent.ts`](../supabase/functions/_shared/agent.ts), [`supabase/functions/agent-chat/`](../supabase/functions/agent-chat) |
| Data source map | [`DATA_PLAN.md`](../DATA_PLAN.md) |
| Build log, stage by stage | [`docs/00-overview.md`](00-overview.md) → `docs/13-*` |

## What it is

An agent that screens US airports for modernization opportunity using only public BTS and
FAA data. **All ranking numbers come from deterministic code**, not from the model. The LLM
routes the question, calls two typed read-only tools, and explains the result in words; it
never computes a score.

Two KPIs, kept structurally separate:

- **Capacity Pressure** — current strain: taxi-out (0.40), NAS delay per departure (0.35),
  % flights delayed >15 min (0.25), min-max normalised across the comparison set.
- **Unmet Demand** — `max(0, FAA TAF forecast CAGR − BTS measured CAGR) × CapacityPressure`.
  The gating is deliberate: forecast growth at an *uncongested* airport is headroom, not
  unmet demand.
- **Expansion Score** = `0.50·UnmetDemand + 0.30·norm(TAF CAGR) + 0.20·CapacityPressure`.

Full derivation and rationale in `ARCHITECTURE.md §2`.

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
  standard composite exists to borrow — see `ARCHITECTURE.md §2`.
- **This is not an ROI, payback, or profitability model.** Project cost and revenue inputs
  are outside any public aviation dataset. It ranks *where demand pressure is highest*,
  which is an input to an investment decision, not the decision.
- No public airport *capacity* (declared throughput) dataset exists; capacity is proxied by
  congestion signals.

These limits are surfaced in the UI and volunteered by the agent unprompted, rather than
being buried here.

## Timebox

One day. Prioritised: honest data lineage, a defensible deterministic core, and explicit
scoping over breadth of airport coverage or UI polish.
