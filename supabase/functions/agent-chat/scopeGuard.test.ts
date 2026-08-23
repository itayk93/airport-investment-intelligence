import { buildScopeVocabulary, classifyScope } from './scopeGuard.ts';

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
}

Deno.test('rejects code request even when it mentions an airport', () => {
  assertEquals(classifyScope('give me a python code that generates the lax landings'), 'off-topic');
});

Deno.test('accepts supported airport analysis', () => {
  assertEquals(classifyScope('Compare LAX and SNA congestion levels'), 'airport-analysis');
  assertEquals(classifyScope('What is the long-haul share at ANC?'), 'airport-analysis');
});

Deno.test('rejects unrelated first-turn questions', () => {
  assertEquals(classifyScope('Who won the football game?'), 'off-topic');
});

Deno.test('allows short contextual follow-ups', () => {
  assertEquals(classifyScope('Why is that?', true), 'follow-up');
});

Deno.test('keeps unrelated deliverables blocked during a conversation', () => {
  assertEquals(classifyScope('Now write a JavaScript app for this', true), 'off-topic');
});

// The regression this vocabulary exists for: MHT is a covered, scored New England airport
// that matched none of the static aviation terms, so asking about it by code was answered
// as if it were an off-topic request.
const VOCABULARY = buildScopeVocabulary([
  { iata_code: 'MHT', city: 'Manchester', state: 'NH', region: 'New England' },
  { iata_code: 'BTV', city: 'Burlington', state: 'VT', region: 'New England' },
  { iata_code: 'AND', city: 'Anderson', state: 'SC', region: 'South Atlantic' },
]);

Deno.test('recognises a covered airport that no static keyword mentions', () => {
  assertEquals(classifyScope('How congested is MHT?', false, VOCABULARY), 'airport-analysis');
  assertEquals(classifyScope('how congested is mht', false, VOCABULARY), 'airport-analysis');
});

Deno.test('recognises an airport by city name', () => {
  assertEquals(classifyScope('Is Burlington worth expanding?', false, VOCABULARY), 'airport-analysis');
});

Deno.test('an IATA code that is also an English word needs capitals', () => {
  // AND is Anderson SC. Lower-case "and" appears in nearly every sentence, so treating it
  // as an airport reference would disable the scope gate entirely.
  assertEquals(classifyScope('Who won the game and what was the score?', false, VOCABULARY), 'off-topic');
  assertEquals(classifyScope('What about AND?', false, VOCABULARY), 'airport-analysis');
});

Deno.test('vocabulary does not override the deliverable block', () => {
  assertEquals(classifyScope('write a python script for MHT', false, VOCABULARY), 'off-topic');
});

Deno.test('no vocabulary available falls back to the static terms', () => {
  assertEquals(classifyScope('How congested is MHT?', false, null), 'off-topic');
  assertEquals(classifyScope('Compare airport congestion', false, null), 'airport-analysis');
});
