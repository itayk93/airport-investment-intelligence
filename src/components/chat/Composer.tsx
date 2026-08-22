import { useEffect, useRef, useState } from 'react';
import { t } from '../../lib/theme';
import { useVoiceInput } from '../../hooks/useVoiceInput';

export function Composer({
  onSend,
  disabled,
  compact = false,
  hasConversation = false,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
  compact?: boolean;
  hasConversation?: boolean;
}) {
  const [value, setValue] = useState('');
  const [hovered, setHovered] = useState<'mic' | 'ask' | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const voice = useVoiceInput((transcript) => {
    setValue((prev) => (prev ? `${prev} ${transcript}` : transcript));
    textarea.current?.focus();
  });

  const maxHeight = compact ? 84 : 96;

  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [value, maxHeight]);

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue('');
  };

  const micHint = !voice.supported
    ? 'voice input unavailable in this browser'
    : voice.error
      ? voice.error.toLowerCase()
      : voice.listening
        ? 'listening — speak now'
        : compact
          ? 'tap the mic to speak'
          : 'enter to send · shift+enter for newline';

  const canSend = !disabled && value.trim().length > 0;
  const btn = compact ? 44 : 36;

  return (
    <div
      style={
        compact
          ? {
              flex: 'none',
              padding: '10px 14px calc(14px + env(safe-area-inset-bottom))',
              background: t.bg,
              borderTop: `1px solid rgba(22,32,43,.1)`,
            }
          : { flex: 'none', padding: '14px 34px 22px' }
      }
    >
      <div
        style={{
          background: t.surface,
          border: `1px solid ${t.ink16}`,
          borderRadius: compact ? 14 : 13,
          padding: compact ? '8px 8px 8px 14px' : '10px 10px 10px 16px',
          display: 'flex',
          alignItems: 'flex-end',
          gap: compact ? 8 : 10,
          boxShadow: compact ? 'none' : '0 2px 10px rgba(22,32,43,.05)',
        }}
      >
        <textarea
          ref={textarea}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            // On mobile Enter inserts a newline — the on-screen keyboard has no shift and
            // the send button is right there.
            if (e.key === 'Enter' && !e.shiftKey && !compact) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={
            hasConversation
              ? 'Ask a follow up question'
              : compact
                ? 'Ask about capacity or demand…'
                : 'Ask about capacity, congestion, unmet demand…'
          }
          aria-label="Ask the airport investment agent a question"
          style={{
            flex: 1,
            border: 0,
            outline: 0,
            resize: 'none',
            background: 'transparent',
            // 16px on mobile, not the mock's 15px: iOS Safari auto-zooms any focused input
            // below 16px, which shifts the whole layout on first tap.
            font: `400 ${compact ? 16 : 14}px/${compact ? 1.45 : 1.5} ${t.sans}`,
            padding: compact ? '8px 0' : '6px 0',
            maxHeight,
            color: t.ink,
          }}
        />

        <button
          type="button"
          onClick={voice.toggle}
          disabled={!voice.supported}
          title={voice.supported ? 'Voice input' : 'Voice input not supported in this browser'}
          aria-label="Toggle voice input"
          aria-pressed={voice.listening}
          onMouseEnter={() => !compact && setHovered('mic')}
          onMouseLeave={() => !compact && setHovered(null)}
          className={compact ? 'press' : undefined}
          style={{
            flex: 'none',
            width: btn,
            height: btn,
            borderRadius: compact ? 11 : 9,
            border: `1px solid ${hovered === 'mic' && voice.supported ? t.accent : t.ink16}`,
            background: voice.listening ? t.accent : 'transparent',
            cursor: voice.supported ? 'pointer' : 'not-allowed',
            opacity: voice.supported ? 1 : 0.45,
            display: 'grid',
            placeItems: 'center',
            transition: '.15s',
          }}
        >
          <svg
            width={compact ? 16 : 15}
            height={compact ? 16 : 15}
            viewBox="0 0 24 24"
            fill="none"
            stroke={voice.listening ? t.inkOn : t.ink}
            strokeWidth="1.9"
            strokeLinecap="round"
          >
            <rect x="9" y="2" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0014 0M12 18v4" />
          </svg>
        </button>

        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          aria-label="Send question"
          onMouseEnter={() => !compact && setHovered('ask')}
          onMouseLeave={() => !compact && setHovered(null)}
          className={compact ? 'press' : undefined}
          style={{
            flex: 'none',
            width: compact ? btn : undefined,
            height: btn,
            padding: compact ? 0 : '0 16px',
            borderRadius: compact ? 11 : 9,
            border: 0,
            background: hovered === 'ask' && canSend ? t.accent : t.ink,
            color: t.inkOn,
            font: `500 13px/1 ${t.sans}`,
            cursor: canSend ? 'pointer' : 'not-allowed',
            opacity: canSend ? 1 : 0.5,
            display: 'grid',
            placeItems: 'center',
            transition: '.15s',
          }}
        >
          {compact ? (
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke={t.inkOn}
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          ) : (
            'Ask'
          )}
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: compact ? 'center' : 'space-between',
          gap: 16,
          marginTop: compact ? 7 : 8,
          font: `400 ${compact ? 10 : 10.5}px/1.3 ${t.mono}`,
          color: voice.error ? t.accent : t.ink42,
        }}
      >
        <span>{micHint}</span>
        {!compact && <span style={{ color: t.ink42 }}>scores from code · prose from model</span>}
      </div>
    </div>
  );
}
