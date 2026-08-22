import { t } from '../lib/theme';
import { WhatsAppLauncher } from './WhatsAppLauncher';

export function Header({
  subtitle,
  compact = false,
  onHome,
}: {
  subtitle: string;
  compact?: boolean;
  onHome?: () => void;
}) {
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
        <img
          src="/favicon.svg"
          alt=""
          aria-hidden="true"
          style={{
            flex: 'none',
            width: compact ? 30 : 34,
            height: compact ? 30 : 34,
          }}
        />
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
      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 6 : 12, minWidth: 0 }}>
        {!compact && (
          <div style={{ font: `400 10.5px/1 ${t.mono}`, color: t.onInk50 }}>{subtitle}</div>
        )}
        {onHome && (
          <button
            type="button"
            onClick={onHome}
            aria-label="Back to home"
            title="Back to home"
            className={compact ? 'press' : undefined}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              minWidth: compact ? 44 : undefined,
              minHeight: 44,
              padding: compact ? '0 10px' : '0 13px',
              border: '1px solid rgba(246,244,239,.24)',
              borderRadius: 9,
              background: 'rgba(246,244,239,.08)',
              color: t.inkOn,
              font: `500 12px/1 ${t.sans}`,
              cursor: 'pointer',
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>
              ←
            </span>
            {!compact && <span>Back to home</span>}
          </button>
        )}
        <WhatsAppLauncher compact={compact} />
      </div>
    </header>
  );
}
