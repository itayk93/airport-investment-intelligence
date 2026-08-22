import { useMemo } from 'react';
import { parseReply, segments } from '../../lib/parseReply';
import { t } from '../../lib/theme';
import type { ToolCall } from '../../api/types';

function Rich({ text }: { text: string }) {
  return (
    <>
      {segments(text).map((s, i) =>
        s.bold ? <strong key={i} style={{ fontWeight: 600 }}>{s.text}</strong> : <span key={i}>{s.text}</span>,
      )}
    </>
  );
}

export function AgentMessage({
  content,
  toolTrace,
  isError,
}: {
  content: string;
  toolTrace?: ToolCall[];
  isError?: boolean;
}) {
  const lines = useMemo(() => parseReply(content), [content]);

  return (
    <div style={{ display: 'flex', gap: 13, maxWidth: 660 }}>
      <div
        style={{
          flex: 'none',
          width: 24,
          height: 24,
          borderRadius: '50%',
          border: `1.5px solid ${isError ? t.muted : t.accent}`,
          marginTop: 2,
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, minWidth: 0 }}>
        {lines.map((line, i) => {
          if (line.kind === 'bullet') {
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 10,
                  font: `400 13.5px/1.55 ${t.sans}`,
                  color: t.ink82,
                }}
              >
                <span style={{ color: t.accent, fontFamily: t.mono, fontSize: 12, flex: 'none' }}>
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
                  padding: '2px 0 2px 11px',
                  font: `400 12.5px/1.55 ${t.mono}`,
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
                  : `400 14px/1.62 ${t.sans}`,
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

        {toolTrace && toolTrace.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              marginTop: 2,
              font: `400 10px/1 ${t.mono}`,
              color: t.ink42,
            }}
          >
            <span>queried</span>
            {toolTrace.map((call, i) => (
              <span
                key={i}
                style={{
                  border: `1px solid ${t.ink14}`,
                  borderRadius: 4,
                  padding: '3px 6px',
                  color: t.ink50,
                }}
              >
                {call.tool}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
