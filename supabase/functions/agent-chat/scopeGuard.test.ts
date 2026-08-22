import { classifyScope } from './scopeGuard.ts';

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
