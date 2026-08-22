import { useEffect, useRef, useState } from 'react';
import { t } from '../../lib/theme';
import { useVoiceInput } from '../../hooks/useVoiceInput';

export function Composer({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState('');
  const [hovered, setHovered] = useState<'mic' | 'ask' | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const voice = useVoiceInput((transcript) => {
    setValue((prev) => (prev ? `${prev} ${transcript}` : transcript));
    textarea.current?.focus();
  });

  // Grow with content up to the design's 96px cap, then scroll.
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, [value]);

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
        : 'enter to send · shift+enter for newline';

  return (
    <div style={{ flex: 'none', padding: '14px 34px 22px' }}>
      <div
        style={{
          background: t.surface,
          border: `1px solid ${t.ink16}`,
          borderRadius: 13,
          padding: '10px 10px 10px 16px',
          display: 'flex',
          alignItems: 'flex-end',
          gap: 10,
          boxShadow: '0 2px 10px rgba(22,32,43,.05)',
        }}
      >
        <textarea
          ref={textarea}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask about capacity, congestion, unmet demand…"
          aria-label="Ask the airport investment agent a question"
          style={{
            flex: 1,
            border: 0,
            outline: 0,
            resize: 'none',
            background: 'transparent',
            font: `400 14px/1.5 ${t.sans}`,
            padding: '6px 0',
            maxHeight: 96,
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
          onMouseEnter={() => setHovered('mic')}
          onMouseLeave={() => setHovered(null)}
          style={{
            flex: 'none',
            width: 36,
            height: 36,
            borderRadius: 9,
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
            width="15"
            height="15"
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
          disabled={disabled || !value.trim()}
          onMouseEnter={() => setHovered('ask')}
          onMouseLeave={() => setHovered(null)}
          style={{
            flex: 'none',
            height: 36,
            padding: '0 16px',
            borderRadius: 9,
            border: 0,
            background: hovered === 'ask' && !disabled && value.trim() ? t.accent : t.ink,
            color: t.inkOn,
            font: `500 13px/1 ${t.sans}`,
            cursor: disabled || !value.trim() ? 'not-allowed' : 'pointer',
            opacity: disabled || !value.trim() ? 0.5 : 1,
            transition: '.15s',
          }}
        >
          Ask
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          marginTop: 8,
          font: `400 10.5px/1.4 ${t.mono}`,
          color: voice.error ? t.accent : t.ink42,
        }}
      >
        <span>{micHint}</span>
        <span style={{ color: t.ink42 }}>scores from code · prose from model</span>
      </div>
    </div>
  );
}
