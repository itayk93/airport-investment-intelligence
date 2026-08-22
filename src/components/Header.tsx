import { t } from '../lib/theme';

export function Header({ subtitle }: { subtitle: string }) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 24,
        padding: '14px 26px',
        borderBottom: `1px solid ${t.ink14}`,
        background: t.ink,
        color: t.inkOn,
        flex: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            width: 30,
            height: 30,
            border: `1.5px solid ${t.accent}`,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            font: `600 11px/1 ${t.mono}`,
            color: t.accentHi,
          }}
        >
          AI
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <div style={{ font: `600 14.5px/1.15 ${t.sans}`, letterSpacing: '-.01em' }}>
            Airport Investment Intelligence
          </div>
          <div style={{ font: `400 11px/1.2 ${t.mono}`, color: t.onInk50 }}>
            modernization screening agent · pilot set
          </div>
        </div>
      </div>
      <div style={{ font: `400 10.5px/1 ${t.mono}`, color: t.onInk50 }}>{subtitle}</div>
    </header>
  );
}
