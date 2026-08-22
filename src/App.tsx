import { useMemo } from 'react';
import { Header } from './components/Header';
import { ChatPane } from './components/chat/ChatPane';
import { AnalysisPanel } from './components/panel/AnalysisPanel';
import { useAirportData } from './hooks/useAirportData';
import { useChat } from './hooks/useChat';
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
  const { messages, pending, ask } = useChat();

  // Coverage is stated up front rather than discovered mid-conversation — the assignment
  // asks for scoping to be communicated clearly, and only one month of congestion data is
  // ingested so far.
  const { headerNote, welcomeNote } = useMemo(() => {
    const congestion = data?.coverage.find((c) => c.data_scope === 'domestic_ontime');
    const volume = data?.coverage.find((c) => c.data_scope === 't100_all');
    const count = data?.scores.length ?? 0;

    if (!congestion || !volume) {
      return {
        headerNote: 'loading coverage…',
        welcomeNote:
          'I rank US airports on current congestion and forecast growth, using only public BTS and FAA data — and I show the arithmetic behind every number.',
      };
    }

    const congestionPeriod =
      congestion.first_period === congestion.last_period
        ? formatPeriod(congestion.last_period)
        : `${formatPeriod(congestion.first_period)}–${formatPeriod(congestion.last_period)}`;

    return {
      headerNote: `${count} airports · congestion ${congestionPeriod} · BTS + FAA`,
      welcomeNote: `I rank ${count} US airports on current congestion and forecast growth, using only public BTS and FAA data — and I show the arithmetic. Congestion figures cover ${congestionPeriod}; traffic volume covers ${formatPeriod(volume.first_period)}–${formatPeriod(volume.last_period)}.`,
    };
  }, [data]);

  return (
    <div
      style={{
        height: '100dvh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        background: t.bg,
      }}
    >
      <Header subtitle={headerNote} />
      <div
        className="app-grid"
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
          coverageNote={welcomeNote}
        />
        <AnalysisPanel data={data} loading={loading} error={error} />
      </div>
    </div>
  );
}
