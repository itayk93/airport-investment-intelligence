# Generic Airport Data Retrieval

## Why this refactor exists

The first agent design exposed separate tools for scores, monthly metrics, and FAA
forecasts. A later long-haul failure was initially repaired with a prompt rule dedicated to
that question. Although the rule fixed the example, it was the wrong abstraction: every
new wording or metric could require another prompt exception.

The current design has no function per question. The model interprets natural language;
one general, allowlisted data tool retrieves facts.

## Runtime flow

```text
User question
  -> model identifies airports, metrics, period, and optional scope
  -> mandatory first-round tool call
  -> list_airports or get_airport_data
  -> server validates canonical inputs against the data dictionary
  -> parameterized SELECT through the read-only agent_reader role
  -> rows plus source/scope/unit/period metadata
  -> model explains the retrieved facts and their limits
```

Example:

```text
"What percentage of ANC departures are long-haul?"
```

becomes:

```json
{
  "airports": ["ANC"],
  "metrics": ["long_haul_share_pct"]
}
```

The result includes the value (`28.77`), unit (`percent`), period (`2026-05`), source
(`BTS On-Time`), and scope (`domestic_ontime`). The final answer must therefore say that
the number represents the covered domestic reporting-carrier sample, not every domestic
and international departure.

## Tool contracts

### `list_airports`

Resolves place names and reports actual dataset coverage. Its response also includes the
metric dictionary, so a coverage lookup cannot lead directly to an unsupported “data does
not exist” claim without metric discovery.

### `get_airport_data`

Input:

| Field | Contract |
|---|---|
| `airports` | Array of validated three-letter IATA codes; maximum 20 |
| `metrics` | Array of canonical metric names; deduplicated and capped at 12 |
| `from` | Optional `YYYY` or `YYYY-MM` inclusive start |
| `to` | Optional `YYYY` or `YYYY-MM` inclusive end |
| `scope` | Optional `domestic_ontime` or `t100_all` |

Output:

| Field | Meaning |
|---|---|
| `metric_metadata` | Source family, database field, unit, description, and valid scopes |
| `rows` | Only requested fields plus airport, period, scenario, and scope identifiers |
| `unavailable_metrics` | Unknown or scope-incompatible requests |
| `available_metrics` | Full discovery catalog when the request cannot be satisfied |
| `notes` | Stable interpretation rules for FAA scenarios and BTS scopes |

Calling `get_airport_data` with an empty `metrics` array is a discovery operation. It
returns all supported metrics rather than querying data.

## Data dictionary

The dictionary is defined in
`supabase/functions/agent-chat/dataCatalog.ts`. It currently exposes 22 canonical metrics
across three source families:

- Deterministic scores: capacity pressure, growth gap, unmet demand, expansion score.
- Monthly BTS evidence: departures, passengers, seats, load factor, delays,
  cancellations, diversions, taxi-out, stage length, and long-haul measures.
- FAA TAF: annual enplanements and operations.

Each entry maps to a fixed database field. The model can choose a metric name but cannot
choose a table, column expression, join, or SQL fragment.

Ambiguous wording is resolved semantically. For example:

| User wording | Canonical metric |
|---|---|
| “waiting before takeoff” | `avg_taxi_out_minutes` |
| “flights cancelled” | `cancellation_rate_pct` |
| “people travelling through BOS” | `passengers` |
| “future LAX passenger boardings” | `forecast_enplanements` |
| “long flights” | `long_haul_share_pct` or `long_haul_departures` |

No new server function is required for these phrasings.

## Discovery and refusal behavior

The first model round uses `tool_choice: required`. A factual airport answer therefore
cannot bypass retrieval merely because the model believes it already knows the answer.

When wording does not map clearly to a canonical metric, the model requests discovery.
When a requested metric is unknown or invalid for a selected scope, the tool returns
`available_metrics`. Only after inspecting that catalog may the model explain that the
dataset cannot answer the question.

Example: “How many terminal gates does ANC have?” The system performs a tool call, sees
that gate count is absent, and refuses to invent it. This is different from guessing that
the data is unavailable from prompt memory.

## Safety and cost invariants

- No free-form SQL is exposed.
- IATA codes, metrics, periods, and scopes are validated at the boundary.
- Database queries remain parameterized and use `agent_reader`.
- Date filtering happens inside Postgres before the 500-row ceiling.
- Tool output remains capped at 12 KiB before it enters later model rounds.
- The agent loop remains capped at four rounds.
- Per-IP and global rate limits run before the paid model call.
- Web and WhatsApp use the same shared agent, prompt, catalog, and tools.
- Shared answer contract defaults to ≤120 words (≤150 for comparisons), caps generation at
  320 tokens, and appends only one compact score caveat. WhatsApp adds transport-level
  splitting when the final text still exceeds one message.

## Verification

Automated checks:

- Catalog contains score, monthly, and forecast families.
- Metric input is allowlisted, deduplicated, and unknown names are reported.
- `YYYY` and `YYYY-MM` periods parse correctly; malformed periods are rejected.
- Deno type-check covers both web and WhatsApp functions.
- Existing deterministic scoring tests and the production web build remain green.

Live checks against the deployed Edge Function:

| Unseen question | Result |
|---|---|
| SFO cancellation rate in May 2026 | `0.79%`, BTS On-Time scope |
| BOS passengers in Q1 2025 | `4,434,833`, summed from three T-100 months |
| LAX forecast enplanements in 2032 | `44,031,499`, FAA scenario 1 |
| ANC terminal gate count | Correct refusal after tool-based discovery |
| ANC long-haul share | `28.77%`, May 2026 domestic reporting-carrier scope |

## Adding a metric

Adding supported evidence does not add a question-specific tool. Add one catalog entry,
ensure the underlying allowlisted query selects that field, and add catalog/range tests.
The natural-language layer can then map new phrasings to the canonical name.
