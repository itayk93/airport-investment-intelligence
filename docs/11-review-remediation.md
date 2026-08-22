# Review Remediation — 2026-08-22

This document records changes made after an end-to-end review of the live application,
source code, scoring methodology, agent behavior, and stated requirements.

## 1. Unmet-demand scoring invariant

### Finding

The original raw formula multiplied growth gap by capacity pressure and then normalized
values that included BOS's negative result. This caused ANC, whose capacity pressure was
exactly zero, to receive a positive normalized unmet-demand score. That contradicted the
stated rule that forecast growth at an uncongested airport represents headroom rather than
unmet demand.

### Change

Raw unmet demand now uses:

```text
max(0, ForecastGrowthGap) × CapacityPressure
```

Only non-negative raw results are normalized. Zero pressure and non-positive growth are
therefore guaranteed to produce zero unmet demand. Pure scoring helpers live in
`scripts/lib/scoring.mjs` and regression tests cover both invariants.

### Updated pilot results

| Airport | Capacity pressure | Growth gap (pp) | Unmet demand | Expansion score |
|---|---:|---:|---:|---:|
| SFO | 1.00 | +2.07 | 1.00 | 1.00 |
| LAX | 0.46 | +1.15 | 0.26 | 0.30 |
| BOS | 0.63 | −0.91 | 0.00 | 0.26 |
| SNA | 0.52 | +0.12 | 0.03 | 0.12 |
| ANC | 0.00 | +0.52 | 0.00 | 0.05 |

The corrected scores were written to the live Supabase database.

Each successful scoring run replaces the prior materialized score set. New rows are fully
inserted before older rows are removed, so a failed insert leaves the last complete set
available. The shared read query still selects the newest row per airport defensively.

## 2. Guaranteed score disclosure

### Finding

The system prompt requested caveats, but a live LAX/SNA comparison omitted them on the
first answer. Prompt-only compliance was not deterministic.

### Change

The shared agent now appends a fixed disclosure whenever `get_airport_data` requests one
or more deterministic score metrics.
It states that scores are modeled proxies, ranked inside each airport's US Census region,
based on heuristic weights and one month of congestion evidence, and are not ROI estimates. The
disclosure no longer depends on model behavior.

## 3. Confidence language

### Finding

A live follow-up described confidence as moderate-to-high despite limited coverage and no
project economics.

### Change

The agent prompt now defines confidence as low-to-moderate for screening and insufficient
for an investment decision. It prohibits high-confidence language without project-cost,
revenue, physical-capacity, and multi-period congestion evidence.

## 4. Profitability and payback claims

### Finding

UI and documentation used "payback" language although the model contains no CAPEX,
incremental revenue, financing, or ROI inputs.

### Change

User-facing copy now calls the output a modernization opportunity index. README,
architecture documentation, scoring documentation, metadata, and social preview explicitly
state that this is a screening model, not a profitability, ROI, or payback model.

## 5. Automated verification

Added Node's built-in test runner and four scoring regression tests:

- zero pressure produces zero unmet demand;
- negative growth gap produces zero unmet demand;
- positive growth is gated by pressure;
- normalization preserves zero as the floor for non-negative raw demand.

Validation completed:

```text
npm test       4 passed, 0 failed
npm run build  TypeScript and Vite production build passed
git diff --check  passed
```

Both Supabase Edge Functions were redeployed after the change. The live database and
server-side agent behavior therefore match the corrected source.
