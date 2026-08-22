import { useState } from 'react';
import { labelStyle, t, tierFor, toneFor } from '../../lib/theme';
import { num, type AirportDataResponse, type ScoreRow, type WeightRow } from '../../api/types';

const pct = (v: number | null, digits = 2) => (v === null ? '—' : v.toFixed(digits));
const signed = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}`);
const barWidth = (v: number | null) => `${Math.max(0, Math.min(1, v ?? 0)) * 100}%`;

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
      <span>{children}</span>
      {right && <span>{right}</span>}
    </div>
  );
}

function Weights({ title, rows }: { title: string; rows: WeightRow[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <SectionLabel>{title}</SectionLabel>
      {rows.map((w) => (
        <div key={w.key} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: `400 12.5px/1.3 ${t.sans}`, color: t.ink }}>{w.label}</div>
            <div style={{ font: `400 10.5px/1.35 ${t.mono}`, color: t.ink45 }}>{w.source}</div>
          </div>
          <div
            style={{
              flex: 'none',
              width: 78,
              height: 5,
              background: 'rgba(22,32,43,.1)',
              borderRadius: 3,
              overflow: 'hidden',
            }}
          >
            <div style={{ height: '100%', background: t.ink, width: `${w.weight * 100}%` }} />
          </div>
          <div
            style={{
              flex: 'none',
              width: 34,
              textAlign: 'right',
              font: `500 11.5px/1 ${t.mono}`,
            }}
          >
            {Math.round(w.weight * 100)}%
          </div>
        </div>
      ))}
    </div>
  );
}

function RankRow({
  row,
  rank,
  selected,
  onSelect,
}: {
  row: ScoreRow;
  rank: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const [hover, setHover] = useState(false);
  const score = num(row.expansion_score);
  const tone = toneFor(score);
  const active = hover || selected;

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: t.surface,
        border: `1px solid ${active ? t.accent : t.ink11}`,
        borderRadius: 10,
        padding: '11px 13px',
        cursor: 'pointer',
        transition: '.14s',
        boxShadow: active ? '0 2px 8px rgba(22,32,43,.07)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
        <div style={{ font: `500 11px/1 ${t.mono}`, color: t.ink42, width: 16, flex: 'none' }}>
          {String(rank).padStart(2, '0')}
        </div>
        <div style={{ font: `600 14px/1 ${t.mono}`, letterSpacing: '.02em', flex: 'none' }}>
          {row.iata_code}
        </div>
        <div
          style={{
            font: `400 12px/1.2 ${t.sans}`,
            color: t.ink55,
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {row.city ?? row.name}
        </div>
        <div style={{ font: `600 14px/1 ${t.mono}`, color: tone, flex: 'none' }}>
          {pct(score)}
        </div>
      </div>

      <div
        style={{
          height: 4,
          background: t.ink08,
          borderRadius: 3,
          overflow: 'hidden',
          margin: '9px 0 8px',
        }}
      >
        <div style={{ height: '100%', background: tone, width: barWidth(score) }} />
      </div>

      <div
        style={{
          display: 'flex',
          gap: 16,
          font: `400 10.5px/1.3 ${t.mono}`,
          color: t.ink50,
        }}
      >
        <span>pressure {pct(num(row.capacity_pressure))}</span>
        <span>gap {signed(num(row.forecast_growth_gap_pct))}pp</span>
        <span>long-haul {pct(num(row.long_haul_share_pct), 1)}%</span>
      </div>
    </div>
  );
}

function Detail({ row }: { row: ScoreRow }) {
  const score = num(row.expansion_score);
  const rows = [
    {
      label: 'Capacity pressure',
      detail: 'taxi-out, NAS delay, delay frequency',
      value: num(row.capacity_pressure),
      bar: num(row.capacity_pressure),
    },
    {
      label: 'Unmet demand',
      detail: 'growth gap gated by pressure',
      value: num(row.unmet_demand_score),
      bar: num(row.unmet_demand_score),
    },
    {
      label: 'Forecast growth gap',
      detail: 'FAA TAF CAGR − BTS measured CAGR',
      value: num(row.forecast_growth_gap_pct),
      // Gap runs roughly -1 to +2.1pp across the set; map onto 0..1 for the bar only.
      bar:
        num(row.forecast_growth_gap_pct) === null
          ? null
          : (num(row.forecast_growth_gap_pct)! + 1) / 3.1,
    },
    {
      label: 'Long-haul share',
      detail: 'departures ≥ 2,000 mi',
      value: num(row.long_haul_share_pct),
      bar: num(row.long_haul_share_pct) === null ? null : num(row.long_haul_share_pct)! / 100,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          background: t.ink,
          color: t.inkOn,
          borderRadius: 11,
          padding: '15px 17px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 14,
        }}
      >
        <div>
          <div style={{ font: `600 20px/1 ${t.mono}`, letterSpacing: '.02em' }}>{row.iata_code}</div>
          <div
            style={{
              font: `400 11.5px/1.35 ${t.sans}`,
              color: t.onInk60,
              marginTop: 4,
              maxWidth: 210,
            }}
          >
            {row.name}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ font: `600 26px/1 ${t.mono}`, color: t.accentHi }}>{pct(score)}</div>
          <div style={{ font: `400 10px/1.3 ${t.mono}`, color: t.onInk50, marginTop: 3 }}>
            {tierFor(score)}
          </div>
        </div>
      </div>

      <SectionLabel>SCORE COMPONENTS</SectionLabel>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          background: 'rgba(22,32,43,.09)',
          borderRadius: 9,
          overflow: 'hidden',
        }}
      >
        {rows.map((d) => (
          <div
            key={d.label}
            style={{
              background: t.surface,
              padding: '9px 13px',
              display: 'flex',
              alignItems: 'center',
              gap: 11,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: `400 12.5px/1.3 ${t.sans}` }}>{d.label}</div>
              <div style={{ font: `400 10.5px/1.35 ${t.mono}`, color: t.ink45 }}>{d.detail}</div>
            </div>
            <div
              style={{
                flex: 'none',
                width: 64,
                height: 5,
                background: 'rgba(22,32,43,.1)',
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <div style={{ height: '100%', background: t.accent, width: barWidth(d.bar) }} />
            </div>
            <div
              style={{
                flex: 'none',
                width: 46,
                textAlign: 'right',
                font: `500 12px/1 ${t.mono}`,
              }}
            >
              {d.value === null ? '—' : d.value.toFixed(2)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AnalysisPanel({
  data,
  loading,
  error,
}: {
  data: AirportDataResponse | null;
  loading: boolean;
  error: string | null;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [showCaveats, setShowCaveats] = useState(true);

  const scores = data?.scores ?? [];
  const detail = selected ? scores.find((s) => s.iata_code === selected) : undefined;

  return (
    <aside
      className="sb"
      style={{
        overflowY: 'auto',
        background: t.panelBg,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div
        style={{
          position: 'sticky',
          top: 0,
          background: t.panelBg,
          borderBottom: `1px solid rgba(22,32,43,.12)`,
          padding: '15px 22px 12px',
          zIndex: 2,
        }}
      >
        <div style={labelStyle}>ANALYSIS</div>
        <div
          style={{
            font: `600 15px/1.25 ${t.sans}`,
            marginTop: 5,
            letterSpacing: '-.01em',
          }}
        >
          {detail ? `${detail.iata_code} · ${detail.city ?? detail.name}` : 'Modernization payback index'}
        </div>
        <div style={{ font: `400 11.5px/1.45 ${t.mono}`, color: t.ink50, marginTop: 3 }}>
          {detail
            ? 'click again to return to the full ranking'
            : `deterministic · ${scores.length} airports · set ${data?.model.comparison_set ?? '—'}`}
        </div>
      </div>

      <div
        style={{
          padding: '18px 22px 26px',
          display: 'flex',
          flexDirection: 'column',
          gap: 22,
        }}
      >
        {loading && (
          <div style={{ font: `400 12px/1.5 ${t.mono}`, color: t.ink50 }}>loading scores…</div>
        )}

        {error && (
          <div
            style={{
              borderLeft: `2px solid ${t.accent}`,
              padding: '4px 0 4px 11px',
              font: `400 12px/1.55 ${t.mono}`,
              color: t.ink60,
            }}
          >
            Could not load scores: {error}
          </div>
        )}

        {detail && <Detail row={detail} />}

        {!loading && !error && scores.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SectionLabel right={data?.model.comparison_set}>RANKED CANDIDATES</SectionLabel>
            {scores.map((row, i) => (
              <RankRow
                key={row.iata_code}
                row={row}
                rank={i + 1}
                selected={selected === row.iata_code}
                onSelect={() =>
                  setSelected((prev) => (prev === row.iata_code ? null : row.iata_code))
                }
              />
            ))}
          </div>
        )}

        {data && (
          <>
            <Weights
              title="EXPANSION SCORE — WEIGHTS"
              rows={data.model.expansion_weights}
            />
            <Weights
              title="CAPACITY PRESSURE — WEIGHTS"
              rows={data.model.capacity_pressure_weights}
            />

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                borderTop: `1px solid rgba(22,32,43,.12)`,
                paddingTop: 16,
              }}
            >
              <button
                type="button"
                onClick={() => setShowCaveats((v) => !v)}
                style={{
                  textAlign: 'left',
                  background: 'transparent',
                  border: 0,
                  padding: 0,
                  cursor: 'pointer',
                  ...labelStyle,
                  display: 'flex',
                  gap: 7,
                  alignItems: 'center',
                }}
              >
                ASSUMPTIONS &amp; UNCERTAINTY
                <span style={{ fontSize: 9 }}>{showCaveats ? '▲' : '▼'}</span>
              </button>
              {showCaveats &&
                data.model.caveats.map((c) => (
                  <div
                    key={c.tag}
                    style={{
                      display: 'flex',
                      gap: 9,
                      font: `400 11.5px/1.55 ${t.sans}`,
                      color: t.ink60,
                    }}
                  >
                    <span
                      style={{
                        color: t.accent,
                        flex: 'none',
                        fontFamily: t.mono,
                        fontSize: 10,
                        paddingTop: 1,
                      }}
                    >
                      {c.tag}
                    </span>
                    <span style={{ textWrap: 'pretty' }}>{c.text}</span>
                  </div>
                ))}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
