import { useState } from 'react';
import { t } from '../../lib/theme';
import type { AirportDataResponse } from '../../api/types';
import { PanelBody } from './PanelBody';

/** Desktop chrome: a fixed-width right column with a sticky header. */
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
  const detail = selected ? data?.scores.find((s) => s.iata_code === selected) : undefined;

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
          padding: '14px 22px',
          zIndex: 2,
        }}
      >
        <div style={{ font: `600 15px/1.25 ${t.sans}`, letterSpacing: '-.01em' }}>
          {detail ? `${detail.iata_code} · ${detail.city ?? detail.name}` : 'Investment ranking'}
        </div>
      </div>

      <div style={{ padding: '18px 22px 26px' }}>
        <PanelBody
          data={data}
          loading={loading}
          error={error}
          compact={false}
          selected={selected}
          onSelect={setSelected}
        />
      </div>
    </aside>
  );
}
