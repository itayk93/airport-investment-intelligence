import { useRef, useState } from 'react';
import { t } from '../../lib/theme';
import type { AirportDataResponse } from '../../api/types';
import { PanelBody } from './PanelBody';

/**
 * Mobile chrome: a collapsible bottom sheet.
 *
 * Collapsed by default so the chat owns the screen — on a 390px viewport the analysis is
 * reference material, not the primary surface. Expanded it caps at 52dvh so the chat and
 * the composer both stay visible and the sheet never becomes a full-screen takeover.
 */
export function AnalysisSheet({
  data,
  loading,
  error,
}: {
  data: AirportDataResponse | null;
  loading: boolean;
  error: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const detail = selected ? data?.scores.find((s) => s.iata_code === selected) : undefined;

  const selectAirport = (code: string | null) => {
    setSelected(code);
    if (!code) return;

    requestAnimationFrame(() => {
      scroller.current?.scrollTo({
        top: 0,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
    });
  };

  const title = detail
    ? `${detail.iata_code} · ${detail.city ?? detail.name}`
    : 'Modernization opportunity index';

  const subtitle = detail
    ? 'tap the row again to return to the full ranking'
    : `deterministic · ${data?.scores.length ?? 0} airports · ${data?.model.comparison_sets.length ?? 0} regional sets`;

  return (
    <div
      style={{
        flex: 'none',
        background: t.panelBg,
        borderTop: `1px solid ${t.ink16}`,
        boxShadow: '0 -6px 20px rgba(22,32,43,.07)',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: '100%',
          background: 'transparent',
          border: 0,
          padding: '11px 18px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          cursor: 'pointer',
          textAlign: 'left',
          minHeight: 52,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              font: `500 9.5px/1 ${t.mono}`,
              letterSpacing: '.09em',
              color: t.ink42,
            }}
          >
            ANALYSIS
          </div>
          <div
            style={{
              font: `600 13.5px/1.3 ${t.sans}`,
              marginTop: 4,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </div>
        </div>
        <div
          style={{
            flex: 'none',
            font: `400 10px/1 ${t.mono}`,
            color: t.accent,
            letterSpacing: '.06em',
          }}
        >
          {open ? 'CLOSE' : 'OPEN'}
        </div>
      </button>

      {open && (
        <div
          ref={scroller}
          className="sb rise"
          style={{
            maxHeight: '52dvh',
            overflowY: 'auto',
            padding: '2px 18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div style={{ font: `400 11px/1.45 ${t.mono}`, color: t.ink50 }}>{subtitle}</div>
          <PanelBody
            data={data}
            loading={loading}
            error={error}
            compact
            selected={selected}
            onSelect={selectAirport}
          />
        </div>
      )}
    </div>
  );
}
