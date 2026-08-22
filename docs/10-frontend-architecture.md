# Stage 6 — Frontend Architecture

Vite + React + TypeScript (strict). Run: `npm run dev` → http://localhost:5173.

## Structure

```
src/
  config.ts              env parsed + validated at module load; fails loudly, not as a 401
  api/
    types.ts             shared contracts + the single numeric-coercion helper
    client.ts            typed fetch wrappers, one error class
  hooks/
    useChat.ts           chat state machine, abort-on-resend
    useAirportData.ts    panel data fetch
    useVoiceInput.ts     Web Speech API (assignment bonus)
  lib/
    theme.ts             design tokens from the Claude Design source
    parseReply.ts        markdown-ish → the design's three line types
  components/
    Header.tsx
    chat/  ChatPane · AgentMessage · Composer
    panel/ AnalysisPanel
```

Layering is deliberate: components never call `fetch`, never parse env, and never coerce a
raw database value. Each of those happens in exactly one place.

## Design

Built from the supplied Claude Design file (`Airport Investment Agent.dc.html`) — palette
(`#EFECE4` ground, `#16202B` ink, `#B45309` accent), Instrument Sans + IBM Plex Mono
pairing, the two-pane 1fr/496px layout, and the component anatomy (rank rows with score
bars, weight rows, accent-tagged caveats, mono micro-labels).

**What was deliberately not copied:** the mock ships 44 airports of fabricated demo data
and a different 5-factor weight model. Both were dropped. The UI renders the 5 real
airports and the actual weights from `scripts/score.mjs`. Shipping an investment tool
with plausible-looking fake numbers is the one mistake that would matter most here.

## Where the panel's numbers come from

A second edge function, `airport-data`, serves scores, coverage, weights, and caveats.
It shares `_shared/db.ts` with the agent's tool layer, so the panel and the agent execute
the *same query* — they cannot drift or disagree about a score. No LLM sits in the panel's
path: those numbers are rendered exactly as computed.

The scoring weights are served **from the backend**, not hardcoded in the UI, so changing
a weight in one place can't leave the panel displaying a stale figure.

## Decisions worth explaining

- **Numeric coercion in one place.** Postgres `numeric` arrives as a *string* (the driver
  refuses to lossily coerce). `num()` in `api/types.ts` is the only converter; components
  receive `number | null` and render `—` for null rather than `NaN`.
- **Abort in-flight requests on resend.** Without it, a slow first answer can land after a
  fast second one and overwrite it. `useChat` aborts the previous controller.
- **History snapshot at send time.** The outbound message array is built from the state the
  user actually saw, not from whatever state exists when the fetch fires.
- **No markdown library.** ~40 kB to render four constructs the design styles very
  specifically. `parseReply.ts` maps the reply onto the design's `text` / `bullet` / `note`
  line types and renders `**bold**` via segments — no `dangerouslySetInnerHTML`.
- **Caveat sentences get the accent-bordered note treatment**, so scope limits are visually
  distinct from findings instead of buried in a paragraph.
- **Tool trace shown under each answer** (`queried get_airport_scores …`). The assignment
  asks the agent to explain its reasoning; showing which data it actually read makes the
  answer auditable rather than asking the reader to trust it.
- **Coverage stated in the header and welcome copy**, computed from the database, not
  hardcoded — the app says "congestion May 2026" because that is genuinely the only month
  ingested.
- **Voice input via the browser's SpeechRecognition** — no extra key, no audio upload, no
  per-minute cost. Trade-off is browser-dependent support (no Firefox), which the UI
  reports in the hint line instead of silently failing.

## Verified

`npm run build` passes with `tsc` strict, `noUnusedLocals`, and `noUncheckedIndexedAccess`.
Bundle 166 kB (53 kB gzipped), zero runtime dependencies beyond React. No console errors.
Chat, panel ranking, drill-down, and coverage reporting all exercised live against the
deployed edge functions.

## Known gaps

- No streaming — answers appear all at once after the round-trip.
- Below 900px the panel stacks under the chat; the design is desktop-first and was not
  specified for mobile.
- Rank rows are click-to-drill only; the mock's compare view (two airports side by side in
  the panel) is not built — the agent handles comparison in prose instead.
