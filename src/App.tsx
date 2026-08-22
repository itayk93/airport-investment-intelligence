import { useMemo, useState } from 'react';
import { Header } from './components/Header';
import { HomeScreen } from './components/HomeScreen';
import { ChatPane } from './components/chat/ChatPane';
import { Composer } from './components/chat/Composer';
import { AnalysisPanel } from './components/panel/AnalysisPanel';
import { AnalysisSheet } from './components/panel/AnalysisSheet';
import { useAirportData } from './hooks/useAirportData';
import { useChat } from './hooks/useChat';
import { useIsMobile } from './hooks/useMediaQuery';
import { t } from './lib/theme';

/** "202605" → "May 2026". The coverage query returns year*100+month as one integer. */
function formatPeriod(period: number): string {
  const year = Math.floor(period / 100);
  const month = period % 100;
  const name = new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  });
  return `${name} ${year}`;
}

export function App() {
  const { data, loading, error } = useAirportData();
  const { messages, pending, ask, reset } = useChat();
  const isMobile = useIsMobile();
  const [showHome, setShowHome] = useState(true);

  // Coverage is stated up front rather than discovered mid-conversation — the assignment
  // asks for scoping to be communicated clearly, and only one month of congestion data has
  // been ingested. Both strings are derived from the database, never hardcoded.
  const headerNote = useMemo(() => {
    const congestion = data?.coverage.find((c) => c.data_scope === 'domestic_ontime');
    const volume = data?.coverage.find((c) => c.data_scope === 't100_all');
    const count = data?.scores.length ?? 0;

    if (!congestion || !volume) {
      return 'loading coverage…';
    }

    const congestionPeriod =
      congestion.first_period === congestion.last_period
        ? formatPeriod(congestion.last_period)
        : `${formatPeriod(congestion.first_period)}–${formatPeriod(congestion.last_period)}`;

    return `${count} airports · congestion ${congestionPeriod} · BTS + FAA`;
  }, [data]);

  const shell: React.CSSProperties = {
    height: '100dvh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    background: t.bg,
  };

  if (showHome) {
    return (
      <HomeScreen
        data={data}
        subtitle={headerNote}
        compact={isMobile}
        onStart={() => setShowHome(false)}
      />
    );
  }

  const goHome = () => {
    reset();
    setShowHome(true);
  };

  // Mobile: one column — chat, then a collapsible analysis sheet, then the composer. The
  // sheet sits between them because it is reference material the composer must stay
  // reachable above.
  if (isMobile) {
    return (
      <div style={{ ...shell, maxWidth: 520, margin: '0 auto' }}>
        <Header
          subtitle={headerNote}
          compact
          onHome={goHome}
        />
        <ChatPane
          messages={messages}
          pending={pending}
          onSend={ask}
          compact
          footer={
            <>
              <AnalysisSheet data={data} loading={loading} error={error} />
              <Composer
                onSend={ask}
                disabled={pending}
                compact
                hasConversation={messages.length > 0}
              />
            </>
          }
        />
      </div>
    );
  }

  return (
    <div style={shell}>
      <Header
        subtitle={headerNote}
        onHome={goHome}
      />
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1fr) 496px',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <ChatPane
          messages={messages}
          pending={pending}
          onSend={ask}
          footer={
            <Composer
              onSend={ask}
              disabled={pending}
              hasConversation={messages.length > 0}
            />
          }
        />
        <AnalysisPanel data={data} loading={loading} error={error} />
      </div>
    </div>
  );
}
