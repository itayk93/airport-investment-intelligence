// Design tokens taken from the Claude Design source (Airport Investment Agent.dc.html).
// Centralised so a palette change is one edit, not a grep across components.
export const t = {
  bg: '#EFECE4',
  panelBg: '#F7F5F0',
  surface: '#FFFFFF',
  ink: '#16202B',
  inkOn: '#F6F4EF',
  accent: '#B45309',
  accentHi: '#E8A33D',
  muted: '#5C6B7A',

  ink06: 'rgba(22,32,43,.06)',
  ink08: 'rgba(22,32,43,.08)',
  ink11: 'rgba(22,32,43,.11)',
  ink14: 'rgba(22,32,43,.14)',
  ink16: 'rgba(22,32,43,.16)',
  ink30: 'rgba(22,32,43,.30)',
  ink42: 'rgba(22,32,43,.42)',
  ink45: 'rgba(22,32,43,.45)',
  ink50: 'rgba(22,32,43,.50)',
  ink55: 'rgba(22,32,43,.55)',
  ink60: 'rgba(22,32,43,.60)',
  ink82: 'rgba(22,32,43,.82)',
  onInk50: 'rgba(246,244,239,.5)',
  onInk60: 'rgba(246,244,239,.6)',

  sans: "'Instrument Sans', system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
} as const;

/** Small-caps monospace label used throughout the panel. */
export const labelStyle: React.CSSProperties = {
  font: `500 10px/1 ${t.mono}`,
  letterSpacing: '.09em',
  color: t.ink42,
};

/** Score → colour, mirroring the mock's three-tier treatment. */
export function toneFor(score: number | null): string {
  if (score === null) return t.muted;
  if (score >= 0.6) return t.accent;
  if (score >= 0.3) return t.ink;
  return t.muted;
}

export function tierFor(score: number | null): string {
  if (score === null) return 'NO SCORE';
  if (score >= 0.6) return 'PRIORITY TIER';
  if (score >= 0.3) return 'WATCH TIER';
  return 'LOW PRIORITY';
}
