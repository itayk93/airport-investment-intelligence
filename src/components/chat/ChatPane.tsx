import { useEffect, useRef, useState } from 'react';
import { t } from '../../lib/theme';
import type { ChatMessage } from '../../hooks/useChat';
import { AgentMessage } from './AgentMessage';

// The four questions the assignment names, so a reviewer can exercise the system without
// typing — and so the agent's scope is legible before the first question.
const SUGGESTIONS = [
  'Best airport in New England?',
  'Compare LAX and SNA',
  'ANC long-haul share?',
  'Why does SFO rank first?',
];

function Welcome({
  onPick,
  compact,
}: {
  onPick: (q: string) => void;
  compact: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div
      style={{
        maxWidth: compact ? undefined : 640,
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 16 : 18,
        paddingTop: compact ? 0 : 8,
      }}
    >
      <div
        style={{
          font: `400 ${compact ? 22 : 25}px/${compact ? 1.25 : 1.28} ${t.sans}`,
          letterSpacing: '-.015em',
          textWrap: 'pretty',
          maxWidth: compact ? undefined : '24ch',
        }}
      >
        Where should we invest?
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 7,
          marginTop: compact ? 2 : 4,
        }}
      >
        <div style={{ font: `500 10px/1 ${t.mono}`, letterSpacing: '.09em', color: t.ink42 }}>
          QUICK QUESTIONS
        </div>
        {SUGGESTIONS.map((q, i) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            onMouseEnter={() => !compact && setHover(i)}
            onMouseLeave={() => !compact && setHover(null)}
            className={compact ? 'press' : undefined}
            style={{
              textAlign: 'left',
              background: hover === i ? t.surface : 'rgba(255,255,255,.72)',
              border: `1px solid ${hover === i ? t.accent : 'rgba(22,32,43,.13)'}`,
              borderRadius: compact ? 11 : 9,
              padding: compact ? '13px 14px' : '11px 14px',
              font: `400 13.5px/${compact ? 1.42 : 1.4} ${t.sans}`,
              color: t.ink,
              cursor: 'pointer',
              minHeight: compact ? 48 : undefined,
              transition: '.14s',
              transform: hover === i ? 'translateX(3px)' : 'none',
            }}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The scrolling message region. It does not render the composer: on mobile the analysis
 * sheet sits between the messages and the composer, so layout composition belongs to the
 * caller. `footer` is whatever should sit below the scroll area.
 */
export function ChatPane({
  messages,
  pending,
  onSend,
  compact = false,
  footer,
}: {
  messages: ChatMessage[];
  pending: boolean;
  onSend: (text: string) => void;
  compact?: boolean;
  footer?: React.ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
        borderRight: compact ? undefined : `1px solid ${t.ink14}`,
      }}
    >
      <div
        ref={scroller}
        className="sb"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: compact ? '22px 18px 14px' : '30px 34px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: compact ? 20 : 22,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {messages.length === 0 && (
          <Welcome onPick={onSend} compact={compact} />
        )}

        {messages.map((m) => (
          <div key={m.id} className={compact ? 'rise' : undefined}>
            {m.role === 'user' ? (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div
                  style={{
                    maxWidth: compact ? '84%' : '70%',
                    background: t.ink,
                    color: t.inkOn,
                    padding: compact ? '11px 14px' : '11px 15px',
                    borderRadius: '14px 14px 4px 14px',
                    font: `400 14px/1.5 ${t.sans}`,
                  }}
                >
                  {m.content}
                </div>
              </div>
            ) : (
              <AgentMessage
                content={m.content}
                isError={m.isError}
                compact={compact}
              />
            )}
          </div>
        ))}

        {pending && (
          <div style={{ display: 'flex', gap: compact ? 10 : 13, alignItems: 'center' }}>
            <div
              style={{
                flex: 'none',
                width: compact ? 22 : 24,
                height: compact ? 22 : 24,
                borderRadius: '50%',
                border: `1.5px solid ${t.accent}`,
                animation: compact ? 'bl 1.1s infinite' : undefined,
              }}
            />
            <div
              style={{
                font: `400 ${compact ? 12 : 12.5}px/1 ${t.mono}`,
                color: t.ink50,
                animation: 'bl 1.1s infinite',
              }}
            >
              {compact ? 'querying scores…' : 'querying scores · reading BTS and FAA tables'}
            </div>
          </div>
        )}

        <div style={{ height: 6, flex: 'none' }} />
      </div>

      {footer}
    </section>
  );
}
