import { useState } from 'react';
import { labelStyle, t, tierFor, toneFor } from '../../lib/theme';
import { num, type AirportDataResponse, type ScoreRow, type WeightRow } from '../../api/types';

// Shared by the desktop side panel and the mobile bottom sheet. Both surfaces render this
// exact tree — only the surrounding chrome differs — so a change to how a score is
// presented can never apply to one layout and not the other.

const pct = (v: number | null, digits = 2) => (v === null ? '—' : v.toFixed(digits));
const signed = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}`);
const barWidth = (v: number | null) => `${Math.max(0, Math.min(1, v ?? 0)) * 100}%`;

function SectionLabel({
  children,
  right,
  compact,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
  compact: boolean;
}) {
  return (
    <div
      style={{
        ...labelStyle,
        fontSize: compact ? 9.5 : 10,
        display: 'flex',
        justifyContent: 'space-between',
        gap: 10,
      }}
    >
      <span>{children}</span>
      {right && <span>{right}</span>}
    </div>
  );
}

function Weights({
  title,
  rows,
  compact,
}: {
  title: string;
  rows: WeightRow[];
  compact: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 10 : 9 }}>
      <SectionLabel compact={compact}>{title}</SectionLabel>
      {rows.map((w) => (
        <div key={w.key} style={{ display: 'flex', alignItems: 'center', gap: compact ? 10 : 11 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: `400 12.5px/1.35 ${t.sans}`, color: t.ink }}>{w.label}</div>
            {/* The source line is dropped on mobile — it wraps to three lines at 390px and
                buries the weight it is meant to annotate. */}
            {!compact && (
              <div style={{ font: `400 10.5px/1.35 ${t.mono}`, color: t.ink45 }}>{w.source}</div>
            )}
          </div>
          <div
            style={{
              flex: 'none',
              width: compact ? 56 : 78,
              height: 5,
              background: 'rgba(22,32,43,.1)',
              borderRadius: 3,
              overflow: 'hidden',
            }}
          >
            <div
              className="grow-bar"
              style={{ height: '100%', background: t.ink, width: `${w.weight * 100}%` }}
            />
          </div>
          <div
            style={{
              flex: 'none',
              width: compact ? 32 : 34,
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
  compact,
}: {
  row: ScoreRow;
  rank: number;
  selected: boolean;
  onSelect: () => void;
  compact: boolean;
}) {
  const [hover, setHover] = useState(false);
  const score = num(row.expansion_score);
  const tone = toneFor(score);
  const active = (hover && !compact) || selected;

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => !compact && setHover(true)}
      onMouseLeave={() => !compact && setHover(false)}
      className={compact ? 'press rise' : undefined}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      style={{
        background: t.surface,
        border: `1px solid ${active ? t.accent : t.ink11}`,
        borderRadius: compact ? 11 : 10,
        padding: compact ? '12px 13px' : '11px 13px',
        cursor: 'pointer',
        transition: '.14s',
        boxShadow: active ? '0 2px 8px rgba(22,32,43,.07)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: compact ? 8 : 9 }}>
        <div
          style={{
            font: `500 11px/1 ${t.mono}`,
            color: t.ink42,
            width: compact ? undefined : 16,
            flex: 'none',
          }}
        >
          {String(rank).padStart(2, '0')}
        </div>
        <div style={{ font: `600 14px/1 ${t.mono}`, letterSpacing: '.02em', flex: 'none' }}>
          {row.iata_code}
        </div>
        <div
          style={{
            font: `400 ${compact ? 11.5 : 12}px/1.2 ${t.sans}`,
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
        <div style={{ font: `600 14px/1 ${t.mono}`, color: tone, flex: 'none' }}>{pct(score)}</div>
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
        <div className="grow-bar" style={{ height: '100%', background: tone, width: barWidth(score) }} />
      </div>

      <div
        style={{
          display: 'flex',
          gap: compact ? 14 : 16,
          font: `400 10.5px/1.3 ${t.mono}`,
          color: t.ink50,
        }}
      >
        <span>pressure {pct(num(row.capacity_pressure))}</span>
        <span>gap {signed(num(row.forecast_growth_gap_pct))}pp</span>
        {!compact && <span>long-haul {pct(num(row.long_haul_share_pct), 1)}%</span>}
      </div>
    </div>
  );
}

function Detail({ row, compact }: { row: ScoreRow; compact: boolean }) {
  const score = num(row.expansion_score);
  const gap = num(row.forecast_growth_gap_pct);
  const longHaul = num(row.long_haul_share_pct);

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
      value: gap,
      // Gap spans roughly −1 to +2.1pp across the set; mapped onto 0..1 for the bar only.
      bar: gap === null ? null : (gap + 1) / 3.1,
    },
    {
      label: 'Long-haul share',
      detail: 'departures ≥ 2,000 mi',
      value: longHaul,
      bar: longHaul === null ? null : longHaul / 100,
    },
  ];

  return (
    <div className="fade" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        className="pop"
        style={{
          background: t.ink,
          color: t.inkOn,
          borderRadius: compact ? 12 : 11,
          padding: compact ? '14px 16px' : '15px 17px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: compact ? 12 : 14,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ font: `600 ${compact ? 19 : 20}px/1 ${t.mono}`, letterSpacing: '.02em' }}>
            {row.iata_code}
          </div>
          <div
            style={{
              font: `400 ${compact ? 11 : 11.5}px/1.35 ${t.sans}`,
              color: t.onInk60,
              marginTop: 4,
              maxWidth: 210,
            }}
          >
            {row.name}
          </div>
        </div>
        <div style={{ textAlign: 'right', flex: 'none' }}>
          <div style={{ font: `600 ${compact ? 24 : 26}px/1 ${t.mono}`, color: t.accentHi }}>
            {pct(score)}
          </div>
          <div
            style={{
              font: `400 ${compact ? 9.5 : 10}px/1.3 ${t.mono}`,
              color: t.onInk50,
              marginTop: 3,
            }}
          >
            {tierFor(score)}
          </div>
        </div>
      </div>

      <SectionLabel compact={compact}>SCORE COMPONENTS</SectionLabel>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          background: 'rgba(22,32,43,.09)',
          borderRadius: compact ? 10 : 9,
          overflow: 'hidden',
        }}
      >
        {rows.map((d) => (
          <div
            key={d.label}
            style={{
              background: t.surface,
              padding: compact ? '11px 13px' : '9px 13px',
              display: 'flex',
              alignItems: 'center',
              gap: compact ? 10 : 11,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: `400 12.5px/1.35 ${t.sans}`, textWrap: 'pretty' }}>{d.label}</div>
              <div
                style={{
                  font: `400 ${compact ? 10 : 10.5}px/1.35 ${t.mono}`,
                  color: t.ink45,
                }}
              >
                {d.detail}
              </div>
            </div>
            <div
              style={{
                flex: 'none',
                width: compact ? 40 : 64,
                height: 5,
                background: 'rgba(22,32,43,.1)',
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <div className="grow-bar" style={{ height: '100%', background: t.accent, width: barWidth(d.bar) }} />
            </div>
            <div
              style={{
                flex: 'none',
                width: compact ? 42 : 46,
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

export function PanelBody({
  data,
  loading,
  error,
  compact,
  selected,
  onSelect,
}: {
  data: AirportDataResponse | null;
  loading: boolean;
  error: string | null;
  compact: boolean;
  selected: string | null;
  onSelect: (code: string | null) => void;
}) {
  const [showCaveats, setShowCaveats] = useState(!compact);

  const scores = data?.scores ?? [];
  const detail = selected ? scores.find((s) => s.iata_code === selected) : undefined;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 20 : 22,
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

      {detail && <Detail row={detail} compact={compact} />}

      {!loading && !error && scores.length > 0 && (
        <div className="fade" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SectionLabel compact={compact} right={data?.model.comparison_set}>
            RANKED CANDIDATES
          </SectionLabel>
          {scores.map((row, i) => (
            <RankRow
              key={row.iata_code}
              row={row}
              rank={i + 1}
              compact={compact}
              selected={selected === row.iata_code}
              onSelect={() => onSelect(selected === row.iata_code ? null : row.iata_code)}
            />
          ))}
        </div>
      )}

      {data && (
        <>
          <Weights
            title={compact ? 'PAYBACK INDEX — WEIGHTS' : 'EXPANSION SCORE — WEIGHTS'}
            rows={data.model.expansion_weights}
            compact={compact}
          />
          <Weights
            title="CAPACITY PRESSURE — WEIGHTS"
            rows={data.model.capacity_pressure_weights}
            compact={compact}
          />

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: compact ? 9 : 8,
              borderTop: `1px solid rgba(22,32,43,.12)`,
              paddingTop: compact ? 15 : 16,
            }}
          >
            <button
              type="button"
              onClick={() => setShowCaveats((v) => !v)}
              aria-expanded={showCaveats}
              style={{
                textAlign: 'left',
                background: 'transparent',
                border: 0,
                padding: 0,
                cursor: 'pointer',
                ...labelStyle,
                fontSize: compact ? 9.5 : 10,
                display: 'flex',
                gap: 7,
                alignItems: 'center',
                minHeight: compact ? 32 : undefined,
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
  );
}
