# Cost, Scale, and the Evaluation Gap

Three operational questions this document answers with numbers: what a query costs, what
happens under load, and how answer quality is (and is not) verified.

## 1. What one chat query costs

Model: `gpt-4o-mini` — $0.15 per 1M input tokens, $0.60 per 1M output tokens
(OpenAI list price, checked 2026-08-22).

Per-request budget, measured from the deployed function's actual limits:

| Component | Size |
|---|---|
| System prompt (`agent-chat/prompt.ts`, ~8.2 KB) | ~2,000 tokens |
| Tool schemas (`tools.ts` JSON schemas) | ~1,200 tokens |
| History (capped: 20 messages, 2,000 chars each) | typically 200–2,000 tokens |
| Tool results (capped 12 KB per result) | typically 300–1,500 tokens |
| Output (capped `max_tokens: 320`) | ≤320 tokens per round |

A typical question resolves in 1–2 tool rounds. The prompt + tool schemas are re-sent
every round, so:

- **Typical query (2 rounds): ~8–10k input + ~400 output ≈ $0.0015–0.002** — about a
  fifth of a cent.
- **Worst case (4 rounds, full history, full tool results): ~25k input + ~1.3k output
  ≈ $0.005** — half a cent. The 4-round cap in code is also the cost ceiling.
- **1,000 queries ≈ $2. 100k queries ≈ $200.** The LLM is not the expensive part of
  this system at any realistic scale; Supabase and data refresh dominate operational
  effort, not OpenAI spend.
- WhatsApp voice notes add Whisper transcription at $0.006/minute of audio (capped at
  10 MB per note).

OpenAI also caches repeated prompt prefixes (the system prompt + tool schemas are
identical every call) at half the input price, so real spend trends below the estimate.

## 2. What happens at scale

Three separate ceilings, in the order they would be hit:

1. **Our own rate limit first (deliberate).** The edge function rate-limits callers to
   60 requests/hour — a cost-protection choice for a public demo, documented in
   `docs/12-public-deployment-hardening.md`. This trips long before any provider limit.
2. **OpenAI rate limits second.** Limits are per-tier (tier = cumulative spend). On the
   entry tier, `gpt-4o-mini` allows on the order of 500 requests/min and 200k
   tokens/min; at ~10k tokens per query that is roughly 20 concurrent queries per
   minute. One tier up raises this ~10×. The mitigation is the same one already shipped:
   the deterministic panel (`airport-data`, no LLM) keeps working when chat is limited,
   and the 429 message says so.
3. **Postgres last.** The agent's queries are single-airport indexed SELECTs against
   163-row and ~4k-row tables with a 5s statement timeout on a read-only role — not a
   realistic bottleneck at demo or pilot scale.

Scaling levers if this became a product, in order of value per effort: raise the OpenAI
tier (spend threshold, no code), cache identical question+data-version pairs (scores
change monthly at most, so answers are cacheable for a month), and move the per-caller
limit from per-function memory to a shared store.

## 3. Why gpt-4o-mini, and what the upgrade path is

The model's job here is routing, reference resolution, and phrasing — not computation.
Scoring is deterministic code; the model never produces a number that wasn't returned by
a tool. For that job a small model is fast (~1–2s to first token), cheap (above), and
sufficient: all four brief questions resolved correctly in testing at temperature 0.2.

What would justify upgrading, and to what:

- **Multi-step analytical questions** ("build me a shortlist weighing X against Y across
  two regions") that need real planning across many tool calls → a reasoning-capable
  model for the planning turn only, keeping mini for plain lookups (router pattern).
- **Weaker instruction-following observed in the wild** (ignoring the no-superlatives
  rule, misreading sign conventions) → a stronger general model; the two bugs of this
  type found in testing were fixed in the prompt/data-dictionary instead, which is the
  cheaper fix while it works.
- Provider swap is a one-file change (`_shared/agent.ts` defines `MODEL` and the OpenAI
  base URL); nothing else in the system knows which model runs.

## 4. The evaluation gap — stated plainly

What exists today is **runtime enforcement, not regression evaluation**:

- The first model round is forced to call a tool (code, not prompt).
- Tools are typed and allowlisted; the DB role is SELECT-only.
- The score disclosure is appended in code when the tool trace shows score data was used.
- Unit tests cover the deterministic layers: scoring math, input validation, scope
  guard, data catalog (`tests/`, `*.test.ts`).

What does **not** exist: an automated evaluation suite over the agent's *answers*.
Verification of answer quality was manual — the four brief questions plus follow-ups,
re-run against the deployed functions after each prompt change. That process did catch
real failures (an invented ranking, a sign inversion — see
`docs/11-review-remediation.md`), which is exactly why it should be automated:

**Next step, deliberately not built in the one-day scope: a golden-question eval set.**
~20–30 questions with expected facts (not expected wording): the four brief questions,
per-region ranking questions, follow-up chains, out-of-scope questions that must be
declined, and known past failures as regression cases. Each answer is checked
programmatically for: every number in the reply appears in the tool trace; required
caveats present; no superlatives without peer data retrieved. Run on every prompt or
model change. This turns "I check manually" into "the CI checks", and is the first
thing to build if this moves past prototype.
