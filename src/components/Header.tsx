import { t } from '../lib/theme';

export function Header({ subtitle, compact = false }: { subtitle: string; compact?: boolean }) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: compact ? 12 : 24,
        padding: compact ? '12px 16px' : '14px 26px',
        borderBottom: compact ? undefined : `1px solid ${t.ink14}`,
        background: t.ink,
        color: t.inkOn,
        flex: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 10 : 14, minWidth: 0 }}>
        <div
          style={{
            flex: 'none',
            width: compact ? 26 : 30,
            height: compact ? 26 : 30,
            border: `1.5px solid ${t.accent}`,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            font: `600 ${compact ? 10 : 11}px/1 ${t.mono}`,
            color: t.accentHi,
          }}
        >
          AI
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
          <div
            style={{
              font: `600 ${compact ? 13.5 : 14.5}px/${compact ? 1.2 : 1.15} ${t.sans}`,
              letterSpacing: '-.01em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            Airport Investment Intelligence
          </div>
          {/* On mobile the coverage line lives here, since there is no room for a second
              right-aligned column. */}
          <div
            style={{
              font: `400 ${compact ? 10 : 11}px/${compact ? 1.3 : 1.2} ${t.mono}`,
              color: t.onInk50,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {compact ? subtitle : 'modernization screening agent · pilot set'}
          </div>
        </div>
      </div>
      {!compact && (
        <div style={{ font: `400 10.5px/1 ${t.mono}`, color: t.onInk50 }}>{subtitle}</div>
      )}
    </header>
  );
}
