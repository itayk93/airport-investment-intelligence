import { useMemo, useRef, useState } from 'react';
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

const DEFAULT_PANEL_WIDTH = 496;
const MIN_PANEL_WIDTH = 340;
const MIN_CHAT_WIDTH = 420;
const PANEL_WIDTH_KEY = 'airport-investment-panel-width';

function savedPanelWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_PANEL_WIDTH;
  const stored = window.localStorage.getItem(PANEL_WIDTH_KEY);
  if (stored === null) return DEFAULT_PANEL_WIDTH;

  const value = Number(stored);
  return Number.isFinite(value) && value >= MIN_PANEL_WIDTH ? value : DEFAULT_PANEL_WIDTH;
}

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
  const [panelWidth, setPanelWidth] = useState(savedPanelWidth);
  const desktopLayout = useRef<HTMLDivElement>(null);

  const resizePanel = (requestedWidth: number) => {
    const layoutWidth = desktopLayout.current?.getBoundingClientRect().width ?? window.innerWidth;
    const maxWidth = Math.max(MIN_PANEL_WIDTH, layoutWidth - MIN_CHAT_WIDTH);
    const nextWidth = Math.round(Math.min(Math.max(requestedWidth, MIN_PANEL_WIDTH), maxWidth));
    setPanelWidth(nextWidth);
    window.localStorage.setItem(PANEL_WIDTH_KEY, String(nextWidth));
  };

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.classList.add('panel-resizing');
  };

  const moveResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const right = desktopLayout.current?.getBoundingClientRect().right ?? window.innerWidth;
    resizePanel(right - event.clientX);
  };

  const stopResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    document.body.classList.remove('panel-resizing');
  };

  // Coverage is stated up front rather than discovered mid-conversation, so the limits of
  // the ingested data are visible before a question is asked rather than after. Both
  // strings are derived from the database, never hardcoded.
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
        ref={desktopLayout}
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: `minmax(0,1fr) 0 min(${panelWidth}px, calc(100% - ${MIN_CHAT_WIDTH}px))`,
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
        <div
          className="panel-resizer"
          role="separator"
          aria-label="Resize investment ranking panel"
          aria-orientation="vertical"
          aria-valuemin={MIN_PANEL_WIDTH}
          aria-valuenow={panelWidth}
          tabIndex={0}
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerUp={stopResize}
          onPointerCancel={stopResize}
          onDoubleClick={() => resizePanel(DEFAULT_PANEL_WIDTH)}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 50 : 10;
            if (event.key === 'ArrowLeft') {
              event.preventDefault();
              resizePanel(panelWidth + step);
            } else if (event.key === 'ArrowRight') {
              event.preventDefault();
              resizePanel(panelWidth - step);
            } else if (event.key === 'Home') {
              event.preventDefault();
              resizePanel(MIN_PANEL_WIDTH);
            }
          }}
        />
        <AnalysisPanel data={data} loading={loading} error={error} />
      </div>
    </div>
  );
}
