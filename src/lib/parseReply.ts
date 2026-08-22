// Maps the model's markdown-ish reply onto the three line types the design defines:
// text, bullet, and note (the accent-bordered caveat block).
//
// A markdown library would be ~40 kB to render four constructs the design styles very
// specifically. This handles what the agent actually emits — paragraphs, headings, bullets,
// numbered lists, and **bold** — and degrades to plain text for anything else.

export type Line =
  | { kind: 'text'; text: string; heading?: boolean }
  | { kind: 'bullet'; mark: string; text: string }
  | { kind: 'note'; text: string };

/** Inline segments so **bold** can be rendered without dangerouslySetInnerHTML. */
export interface Segment {
  text: string;
  bold: boolean;
}

export function segments(input: string): Segment[] {
  const out: Segment[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    if (m.index > last) out.push({ text: input.slice(last, m.index), bold: false });
    out.push({ text: m[1] ?? '', bold: true });
    last = m.index + m[0].length;
  }
  if (last < input.length) out.push({ text: input.slice(last), bold: false });
  return out.length ? out : [{ text: input, bold: false }];
}

// Sentences that restate a scope limit get the accent-bordered "note" treatment, so caveats
// are visually distinct from findings rather than buried in a paragraph.
const CAVEAT_HINT =
  /\b(caveat|note:|keep in mind|however|not an industry standard|heuristic|relative to|proxy|proxies|only|excluded|does not include|limitation)\b/i;

export function parseReply(reply: string): Line[] {
  const lines: Line[] = [];

  for (const raw of reply.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    // Headings: ###, ##, or a lone bolded line.
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      lines.push({ kind: 'text', text: stripMd(heading[1] ?? ''), heading: true });
      continue;
    }
    if (/^\*\*[^*]+\*\*:?$/.test(line)) {
      lines.push({ kind: 'text', text: stripMd(line), heading: true });
      continue;
    }

    // Bullets: -, *, • or "1." / "1)"
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      lines.push({ kind: 'bullet', mark: '—', text: bullet[1] ?? '' });
      continue;
    }
    const numbered = line.match(/^(\d{1,2})[.)]\s+(.*)$/);
    if (numbered) {
      lines.push({
        kind: 'bullet',
        mark: String(numbered[1] ?? '').padStart(2, '0'),
        text: numbered[2] ?? '',
      });
      continue;
    }

    const isCaveat = CAVEAT_HINT.test(line) && line.length > 60;
    lines.push(isCaveat ? { kind: 'note', text: line } : { kind: 'text', text: line });
  }

  return lines.length ? lines : [{ kind: 'text', text: reply }];
}

function stripMd(s: string): string {
  return s.replace(/\*\*/g, '').replace(/:$/, '').trim();
}
