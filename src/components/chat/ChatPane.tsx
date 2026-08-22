import { useEffect, useRef, useState } from 'react';
import { t } from '../../lib/theme';
import type { ChatMessage } from '../../hooks/useChat';
import { AgentMessage } from './AgentMessage';
import { Composer } from './Composer';

// The four questions the assignment names, so a reviewer can exercise the whole system
// without typing.
const SUGGESTIONS = [
  'Which airports in New England are strong candidates for terminal expansion?',
  'Compare LA and Santa Ana airport congestion levels.',
  'What is the percentage of long haul flights out of Anchorage airport?',
  'What is the unmet flight demand in SFO airport and why?',
];

function Welcome({ onPick, coverageNote }: { onPick: (q: string) => void; coverageNote: string }) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div
      style={{
        maxWidth: 640,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        paddingTop: 8,
      }}
    >
      <div
        style={{
          font: `400 25px/1.28 ${t.sans}`,
          letterSpacing: '-.015em',
          textWrap: 'pretty',
          maxWidth: '24ch',
        }}
      >
        Which airports will pay back a terminal build?
      </div>
      <p
        style={{
          margin: 0,
          font: `400 14px/1.6 ${t.sans}`,
          color: t.ink60,
          maxWidth: '52ch',
          textWrap: 'pretty',
        }}
      >
        {coverageNote}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 4 }}>
        <div style={{ font: `500 10px/1 ${t.mono}`, letterSpacing: '.09em', color: t.ink42 }}>
          TRY
        </div>
        {SUGGESTIONS.map((q, i) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{
              textAlign: 'left',
              background: hover === i ? t.surface : 'rgba(255,255,255,.72)',
              border: `1px solid ${hover === i ? t.accent : 'rgba(22,32,43,.13)'}`,
              borderRadius: 9,
              padding: '11px 14px',
              font: `400 13.5px/1.4 ${t.sans}`,
              color: t.ink,
              cursor: 'pointer',
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

export function ChatPane({
  messages,
  pending,
  onSend,
  coverageNote,
}: {
  messages: ChatMessage[];
  pending: boolean;
  onSend: (text: string) => void;
  coverageNote: string;
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
        borderRight: `1px solid ${t.ink14}`,
      }}
    >
      <div
        ref={scroller}
        className="sb"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '30px 34px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 22,
        }}
      >
        {messages.length === 0 && <Welcome onPick={onSend} coverageNote={coverageNote} />}

        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div
                style={{
                  maxWidth: '70%',
                  background: t.ink,
                  color: t.inkOn,
                  padding: '11px 15px',
                  borderRadius: '14px 14px 4px 14px',
                  font: `400 14px/1.5 ${t.sans}`,
                }}
              >
                {m.content}
              </div>
            </div>
          ) : (
            <AgentMessage
              key={m.id}
              content={m.content}
              toolTrace={m.toolTrace}
              isError={m.isError}
            />
          ),
        )}

        {pending && (
          <div style={{ display: 'flex', gap: 13, alignItems: 'center' }}>
            <div
              style={{
                flex: 'none',
                width: 24,
                height: 24,
                borderRadius: '50%',
                border: `1.5px solid ${t.accent}`,
              }}
            />
            <div
              style={{
                font: `400 12.5px/1 ${t.mono}`,
                color: t.ink50,
                animation: 'bl 1.1s infinite',
              }}
            >
              querying scores · reading BTS and FAA tables
            </div>
          </div>
        )}

        <div style={{ height: 6, flex: 'none' }} />
      </div>

      <Composer onSend={onSend} disabled={pending} />
    </section>
  );
}
