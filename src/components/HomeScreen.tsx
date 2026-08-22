import type { AirportDataResponse } from '../api/types';
import { t } from '../lib/theme';
import { Header } from './Header';
import { WhatsAppLauncher } from './WhatsAppLauncher';

const SOURCES = [
  {
    number: '01',
    name: 'BTS On-Time Performance',
    use: 'Congestion and operational pressure',
    detail: 'Flight-level arrivals, delays and cancellations published by the US Bureau of Transportation Statistics.',
  },
  {
    number: '02',
    name: 'BTS T-100',
    use: 'Traffic volume and long-haul share',
    detail: 'Domestic and international segment data used to measure passenger volume, departures and route distance.',
  },
  {
    number: '03',
    name: 'FAA Terminal Area Forecast',
    use: 'Expected passenger growth',
    detail: 'FAA forecasts used to compare future demand with each airport’s recent traffic baseline.',
  },
];

export function HomeScreen({
  data,
  subtitle,
  compact,
  onStart,
}: {
  data: AirportDataResponse | null;
  subtitle: string;
  compact: boolean;
  onStart: () => void;
}) {
  // Scored, not merely covered — the headline number should be the one the ranking can
  // actually stand behind. The covered-but-unscored airports are reported in the panel.
  const scoredCount = data?.scores.length ?? 0;
  const coveredCount = data?.airports.length ?? 0;
  const regionCount = data?.model.comparison_sets.length ?? 0;

  return (
    <div
      className="home-screen fade"
      style={{
        minHeight: '100dvh',
        background: t.bg,
        color: t.ink,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Header subtitle={subtitle} compact={compact} />

      <main
        id="main-content"
        style={{
          width: '100%',
          maxWidth: 1240,
          margin: '0 auto',
          padding: compact
            ? '30px 18px calc(32px + env(safe-area-inset-bottom))'
            : 'clamp(52px, 7vh, 86px) 38px 46px',
          flex: 1,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: compact ? '1fr' : 'minmax(0, 1.05fr) minmax(390px, .95fr)',
            gap: compact ? 34 : 'clamp(46px, 7vw, 96px)',
            alignItems: 'start',
          }}
        >
          <section aria-labelledby="home-title">
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                color: t.accent,
                font: `500 ${compact ? 10 : 11}px/1 ${t.mono}`,
                letterSpacing: '.1em',
              }}
            >
              <span style={{ width: 22, height: 1, background: t.accent }} />
              PUBLIC DATA · EXPLAINABLE SCORES
            </div>

            <h1
              id="home-title"
              style={{
                margin: compact ? '18px 0 16px' : '24px 0 20px',
                maxWidth: '13ch',
                font: `600 ${compact ? 38 : 'clamp(48px, 5.2vw, 70px)'}/${compact ? 1.04 : 1.01} ${t.sans}`,
                letterSpacing: '-.045em',
                textWrap: 'balance',
              }}
            >
              Find where airport demand may outgrow capacity.
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: '57ch',
                color: t.ink60,
                font: `400 ${compact ? 16 : 17}px/${compact ? 1.58 : 1.65} ${t.sans}`,
              }}
            >
              Screen US airports for modernization opportunities. Rankings come from deterministic calculations over public BTS and FAA data; the AI explains the evidence and compares airports.
            </p>

            <div
              style={{
                display: 'flex',
                flexDirection: compact ? 'column' : 'row',
                gap: 10,
                marginTop: compact ? 26 : 32,
              }}
            >
              <button
                type="button"
                onClick={onStart}
                className="home-primary press"
                style={{
                  minHeight: 52,
                  padding: '0 20px',
                  border: 0,
                  borderRadius: 12,
                  background: t.ink,
                  color: t.inkOn,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                  font: `600 15px/1 ${t.sans}`,
                  cursor: 'pointer',
                }}
              >
                Start exploring
                <span aria-hidden="true" style={{ fontSize: 20 }}>→</span>
              </button>
              <WhatsAppLauncher prominent />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: compact ? 8 : 12,
                marginTop: compact ? 26 : 36,
              }}
            >
              {[
                // Both numbers, not just the scored one: the gap is the point. A single
                // figure reads as the coverage limit, when it is really the ranking limit —
                // the agent answers on all covered airports and declines to rank the rest
                // for a stated reason.
                [`${coveredCount}`, 'airports covered'],
                [`${scoredCount}`, 'scored & ranked'],
                ['3', 'public sources'],
              ].map(([value, label]) => (
                <div
                  key={label}
                  style={{
                    padding: compact ? '13px 10px' : '16px 15px',
                    borderTop: `1px solid ${t.ink16}`,
                  }}
                >
                  <div style={{ font: `600 ${compact ? 20 : 23}px/1 ${t.sans}` }}>{value}</div>
                  <div style={{ marginTop: 7, color: t.ink50, font: `400 ${compact ? 9 : 10}px/1.2 ${t.mono}`, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="sources-title">
            <div
              style={{
                borderRadius: compact ? 20 : 22,
                padding: compact ? '22px 18px 18px' : '28px 28px 24px',
                background: t.panelBg,
                border: `1px solid ${t.ink11}`,
                boxShadow: compact ? '0 12px 34px rgba(22,32,43,.07)' : '0 22px 60px rgba(22,32,43,.08)',
              }}
            >
              <div style={{ color: t.accent, font: `500 10px/1 ${t.mono}`, letterSpacing: '.1em' }}>
                DATA FOUNDATION
              </div>
              <h2 id="sources-title" style={{ margin: '10px 0 6px', font: `600 ${compact ? 24 : 28}px/1.2 ${t.sans}`, letterSpacing: '-.025em' }}>
                What the answers are built on
              </h2>
              <p style={{ margin: '0 0 10px', color: t.ink55, font: `400 ${compact ? 14 : 14.5}px/1.55 ${t.sans}` }}>
                Every metric links back to a named public dataset and a stated calculation.
              </p>

              {SOURCES.map((source) => (
                <article
                  key={source.number}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: compact ? '34px 1fr' : '40px 1fr',
                    gap: 12,
                    padding: compact ? '17px 0' : '19px 0',
                    borderBottom: `1px solid ${t.ink11}`,
                  }}
                >
                  <div style={{ color: t.accent, font: `500 11px/1.4 ${t.mono}` }}>{source.number}</div>
                  <div>
                    <h3 style={{ margin: 0, font: `600 ${compact ? 15 : 16}px/1.3 ${t.sans}` }}>{source.name}</h3>
                    <div style={{ marginTop: 4, color: t.ink82, font: `500 ${compact ? 12 : 12.5}px/1.4 ${t.sans}` }}>{source.use}</div>
                    <p style={{ margin: '7px 0 0', color: t.ink55, font: `400 ${compact ? 12.5 : 13}px/1.5 ${t.sans}` }}>{source.detail}</p>
                  </div>
                </article>
              ))}

              <div
                style={{
                  marginTop: 18,
                  padding: '13px 14px',
                  borderRadius: 11,
                  background: t.ink06,
                  color: t.ink60,
                  font: `400 ${compact ? 11 : 11.5}px/1.55 ${t.mono}`,
                }}
              >
                Scope: {coveredCount} airports covered, {scoredCount} scored across{' '}
                {regionCount} regional comparison sets · the rest are covered but not ranked,
                each with a stated reason · ranked within a region, never across · screening
                model, not ROI
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
