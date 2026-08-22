import { useMemo } from 'react';
import { parseReply, segments } from '../../lib/parseReply';
import { t } from '../../lib/theme';

function Rich({ text }: { text: string }) {
  return (
    <>
      {segments(text).map((s, i) =>
        s.bold ? (
          <strong key={i} style={{ fontWeight: 600 }}>
            {s.text}
          </strong>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

export function AgentMessage({
  content,
  isError,
  compact = false,
}: {
  content: string;
  isError?: boolean;
  compact?: boolean;
}) {
  const lines = useMemo(() => parseReply(content), [content]);

  const avatar = (
    <div
      style={{
        flex: 'none',
        width: compact ? 22 : 24,
        height: compact ? 22 : 24,
        borderRadius: '50%',
        border: `1.5px solid ${isError ? t.muted : t.accent}`,
        marginTop: compact ? 0 : 2,
      }}
    />
  );

  const body = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, minWidth: 0 }}>
      {lines.map((line, i) => {
        if (line.kind === 'bullet') {
          return (
            <div
              key={i}
              style={{ display: 'flex', gap: compact ? 9 : 10, font: `400 13.5px/1.55 ${t.sans}`, color: t.ink82 }}
            >
              <span
                style={{
                  color: t.accent,
                  fontFamily: t.mono,
                  fontSize: compact ? 11 : 12,
                  flex: 'none',
                  paddingTop: compact ? 2 : 0,
                }}
              >
                {line.mark}
              </span>
              <span style={{ textWrap: 'pretty' }}>
                <Rich text={line.text} />
              </span>
            </div>
          );
        }
        if (line.kind === 'note') {
          return (
            <div
              key={i}
              style={{
                borderLeft: `2px solid ${t.accent}`,
                padding: compact ? '2px 0 2px 10px' : '2px 0 2px 11px',
                font: `400 ${compact ? 12 : 12.5}px/1.55 ${t.mono}`,
                color: t.ink60,
                textWrap: 'pretty',
              }}
            >
              <Rich text={line.text} />
            </div>
          );
        }
        return (
          <p
            key={i}
            style={{
              margin: 0,
              font: line.heading
                ? `600 13px/1.5 ${t.sans}`
                : `400 14px/${compact ? 1.6 : 1.62} ${t.sans}`,
              color: t.ink,
              textWrap: 'pretty',
              letterSpacing: line.heading ? '-.005em' : undefined,
              marginTop: line.heading && i > 0 ? 4 : undefined,
            }}
          >
            <Rich text={line.text} />
          </p>
        );
      })}
    </div>
  );

  // Mobile stacks the avatar above the text: at 390px, an inline avatar plus its gutter
  // costs ~35px of an already narrow measure.
  return compact ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {avatar}
      {body}
    </div>
  ) : (
    <div style={{ display: 'flex', gap: 13, maxWidth: 660 }}>
      {avatar}
      {body}
    </div>
  );
}
