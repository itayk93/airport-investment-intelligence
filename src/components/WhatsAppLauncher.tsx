import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { t } from '../lib/theme';

const SANDBOX_URL = 'https://wa.me/14155238886?text=join%20partly-sister';

function WhatsAppIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20.5 11.7a8.5 8.5 0 01-12.6 7.45L3.5 20.5l1.42-4.2A8.5 8.5 0 1120.5 11.7z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M8.1 7.7c.2-.46.4-.47.72-.48h.6c.18 0 .36.06.45.3l.72 1.74c.08.2.04.37-.08.54l-.55.7c-.12.15-.1.3-.02.46.44.83 1.1 1.52 1.9 2.02.2.12.36.13.5-.04l.75-.92c.14-.17.34-.2.53-.12l1.75.82c.2.1.33.24.3.47-.08.62-.37 1.17-.82 1.58-.43.4-1.02.58-1.6.43-1.3-.33-2.47-.96-3.45-1.86a9.6 9.6 0 01-2.2-2.9c-.38-.84-.32-1.79.15-2.57l.35-.17z"
        fill="currentColor"
      />
    </svg>
  );
}

export function WhatsAppLauncher({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Continue in WhatsApp"
        className={compact ? 'press' : undefined}
        style={{
          flex: 'none',
          minWidth: 44,
          minHeight: 44,
          padding: compact ? 0 : '0 13px',
          borderRadius: 10,
          border: '1px solid rgba(246,244,239,.28)',
          color: t.inkOn,
          background: 'rgba(246,244,239,.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
          cursor: 'pointer',
          font: `500 12px/1 ${t.sans}`,
        }}
      >
        <WhatsAppIcon />
        {!compact && 'WhatsApp'}
      </button>

      {open && (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'grid',
            placeItems: 'center',
            padding: 18,
            background: 'rgba(10,16,22,.58)',
            backdropFilter: 'blur(5px)',
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="whatsapp-title"
            className="pop"
            style={{
              width: 'min(100%, 420px)',
              borderRadius: 18,
              padding: '22px 22px 20px',
              background: t.surface,
              boxShadow: '0 24px 70px rgba(8,15,22,.28)',
              color: t.ink,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18 }}>
              <div>
                <div style={{ font: `500 10px/1 ${t.mono}`, letterSpacing: '.09em', color: t.accent }}>
                  TWILIO SANDBOX · DEMO
                </div>
                <h2 id="whatsapp-title" style={{ margin: '8px 0 0', font: `600 21px/1.25 ${t.sans}` }}>
                  Continue on WhatsApp
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close WhatsApp dialog"
                style={{
                  width: 44,
                  height: 44,
                  margin: '-9px -9px 0 0',
                  border: 0,
                  borderRadius: 10,
                  background: t.ink06,
                  cursor: 'pointer',
                  fontSize: 22,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            <p style={{ margin: '12px 0 18px', color: t.ink60, font: `400 13.5px/1.55 ${t.sans}` }}>
              Scan the QR code or open WhatsApp. Send the prepared join message once, then ask an airport question.
            </p>

            <div
              style={{
                width: 190,
                height: 190,
                margin: '0 auto 18px',
                padding: 12,
                border: `1px solid ${t.ink14}`,
                borderRadius: 13,
                background: '#fff',
              }}
            >
              <QRCodeSVG value={SANDBOX_URL} size={164} level="M" title="Join the Twilio WhatsApp Sandbox" />
            </div>

            <a
              href={SANDBOX_URL}
              target="_blank"
              rel="noreferrer"
              style={{
                minHeight: 48,
                borderRadius: 11,
                background: '#1F7A4D',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 9,
                font: `600 14px/1 ${t.sans}`,
              }}
            >
              <WhatsAppIcon size={19} />
              Open WhatsApp
            </a>

            <p style={{ margin: '13px 2px 0', color: t.ink42, font: `400 10.5px/1.5 ${t.mono}` }}>
              Sandbox session may expire. International delivery is not guaranteed by Twilio. Web chat remains available.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
