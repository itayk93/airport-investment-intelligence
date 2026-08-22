import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

// Guards the code-level de-duplication of the standing score disclosure. The prompt tells
// the model not to write a generic closing caveat; it does anyway, so the strip happens in
// code. Situational caveats must survive — those are the useful ones.
const generic = /(modeled|modelled)\s+proxy|not\s+an\s+roi|roi\s+estimate|project[- ]cost/i;
const strip = (r: string) => r.trim().replace(/\n\n(?:\*\*)?caveat\b[^\n]*(?:\n(?!\n)[^\n]*)*$/i,
  (m) => (generic.test(m) ? '' : m));

Deno.test('strips a trailing generic restatement', () => {
  assertEquals(strip("SFO leads at 0.85.\n\nCaveat: Capacity Pressure is a modeled proxy relative to the Pacific set."),
    "SFO leads at 0.85.");
});
Deno.test('keeps a situational caveat', () => {
  const r = "BTV leads at 0.84.\n\nCaveat: BTV's winter taxi-out includes de-icing, so this partly reflects weather.";
  assertEquals(strip(r), r);
});
Deno.test('keeps body text that merely mentions proxy mid-answer', () => {
  const r = "These are modeled proxy scores.\n\nSFO leads at 0.85.";
  assertEquals(strip(r), r);
});
Deno.test('handles a bolded multi-line generic caveat', () => {
  assertEquals(strip("SFO 0.85.\n\n**Caveat:** these are modelled proxy figures\nand not an ROI estimate."), "SFO 0.85.");
});
Deno.test('no caveat at all is untouched', () => {
  assertEquals(strip("SFO leads at 0.85."), "SFO leads at 0.85.");
});
