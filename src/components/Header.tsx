import { t } from '../lib/theme';
import { WhatsAppLauncher } from './WhatsAppLauncher';

export function Header({
  subtitle: _subtitle,
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
        {onHome && (
          <button
            type="button"
            onClick={onHome}
            aria-label="Back to home"
            title="Back to home"
            className="press"
            style={{
              display: 'grid',
              placeItems: 'center',
              flex: 'none',
              width: 44,
              height: 44,
              padding: 0,
              border: '1px solid rgba(246,244,239,.24)',
              borderRadius: 9,
              background: 'rgba(246,244,239,.08)',
              color: t.inkOn,
              cursor: 'pointer',
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1 }}>←</span>
          </button>
        )}
        <button
          type="button"
          onClick={onHome}
          disabled={!onHome}
          aria-label={onHome ? 'Go to home page' : undefined}
          title={onHome ? 'Home' : undefined}
          className={onHome ? 'header-logo press' : undefined}
          style={{
            display: 'grid',
            placeItems: 'center',
            flex: 'none',
            width: 44,
            height: 44,
            padding: 0,
            border: 0,
            background: 'transparent',
            cursor: onHome ? 'pointer' : 'default',
          }}
        >
          <img
            src="/favicon.svg"
            alt=""
            aria-hidden="true"
            style={{
              width: compact ? 30 : 34,
              height: compact ? 30 : 34,
            }}
          />
        </button>
        <div style={{ minWidth: 0 }}>
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
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 6 : 12, minWidth: 0 }}>
        <WhatsAppLauncher compact={compact} />
      </div>
    </header>
  );
}
