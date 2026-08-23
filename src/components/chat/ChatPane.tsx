import { useEffect, useRef, useState } from 'react';
import { t } from '../../lib/theme';
import type { ChatMessage } from '../../hooks/useChat';
import { AgentMessage } from './AgentMessage';

// Two groups. The first is the four canonical example questions, verbatim rather than
// abbreviated, so they can be exercised exactly as written without typing.
// The second is five questions the expanded coverage makes answerable — each one was
// checked against real ingested data before being listed here, so a quick question can
// never lead to "I don't have that".
const BRIEF_QUESTIONS = [
  'Which airports in New England are strong candidates for terminal expansion?',
  'Compare LA and Santa Ana airport congestion levels.',
  'What is the percentage of long haul flights out of Anchorage airport?',
  'What is the unmet flight demand in SFO airport and why?',
];

const DEEPER_QUESTIONS = [
  // Two mid-sized New England airports the earlier 5-airport build could not see at all.
  'Compare Providence and Manchester as terminal expansion candidates.',
  // BOS has the region's highest capacity pressure but an unmet demand score of exactly 0.
  'Why is Boston not the top expansion candidate in New England?',
  // Raw congestion metrics across a 31-airport regional set.
  'Which Pacific airports have the highest capacity pressure?',
  // long_haul_share_pct is an absolute metric, so this comparison is valid across regions.
  'Compare the long-haul share at JFK, Seattle and Boston.',
  // Answered from score_exclusion_reason on the airports table, not inferred by the model.
  'Which airports are covered but not scored, and why?',
];

function QuestionGroup({
  label,
  questions,
  onPick,
  compact,
}: {
  label: string;
  questions: string[];
  onPick: (q: string) => void;
  compact: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ font: `500 10px/1 ${t.mono}`, letterSpacing: '.09em', color: t.ink42 }}>
        {label}
      </div>
      {questions.map((q, i) => (
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
  );
}

function Welcome({
  onPick,
  compact,
}: {
  onPick: (q: string) => void;
  compact: boolean;
}) {
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
          gap: compact ? 16 : 15,
          marginTop: compact ? 2 : 4,
        }}
      >
        <QuestionGroup
          label="START HERE"
          questions={BRIEF_QUESTIONS}
          onPick={onPick}
          compact={compact}
        />
        <QuestionGroup
          label="GO DEEPER"
          questions={DEEPER_QUESTIONS}
          onPick={onPick}
          compact={compact}
        />
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

  const lastUserId = [...messages].reverse().find((m) => m.role === 'user')?.id;

  useEffect(() => {
    // Keep the welcome screen at its natural top. Auto-scroll only after conversation starts.
    if (messages.length === 0 && !pending) return;
    const el = scroller.current;
    if (!el) return;
    // Pin the latest question to the top of the viewport so the answer reads from its
    // beginning; long answers would otherwise land the reader at their tail end.
    const anchor = lastUserId
      ? el.querySelector<HTMLElement>(`[data-mid="${lastUserId}"]`)
      : null;
    if (anchor) {
      el.scrollTop +=
        anchor.getBoundingClientRect().top - el.getBoundingClientRect().top;
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, pending, lastUserId]);

  return (
    <section
      style={{
        // flex:1 matters on mobile, where this section is a plain flex child of the shell
        // rather than a sized grid cell: without it the section collapses to content height
        // and the composer floats mid-screen instead of pinning to the bottom.
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
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
          <div key={m.id} data-mid={m.id} className={compact ? 'rise' : undefined}>
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
