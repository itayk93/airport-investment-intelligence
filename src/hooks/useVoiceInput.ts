import { useCallback, useEffect, useRef, useState } from 'react';

// Voice input via the browser's built-in SpeechRecognition.
// Chosen over a server-side speech API deliberately: it needs no extra key, no audio
// upload, and no per-minute cost — the trade-off is that support is browser-dependent
// (Chrome/Edge/Safari yes, Firefox no), which the UI reports rather than hides.

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

type Ctor = new () => SpeechRecognitionLike;

function getCtor(): Ctor | null {
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useVoiceInput(onTranscript: (text: string) => void) {
  const supported = typeof window !== 'undefined' && getCtor() !== null;
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  // Keep the latest callback in a ref so restarting recognition isn't required when the
  // consumer re-renders with a new closure.
  const callback = useRef(onTranscript);
  callback.current = onTranscript;

  useEffect(() => {
    const Ctor = getCtor();
    if (!Ctor) return;

    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onresult = (event) => {
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result?.isFinal) finalText += result[0]?.transcript ?? '';
      }
      if (finalText.trim()) callback.current(finalText.trim());
    };

    rec.onerror = (e) => {
      setError(
        e.error === 'not-allowed'
          ? 'Microphone permission denied'
          : `Voice input error: ${e.error ?? 'unknown'}`,
      );
      setListening(false);
    };

    rec.onend = () => setListening(false);
    recognition.current = rec;

    return () => {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
      recognition.current = null;
    };
  }, []);

  const toggle = useCallback(() => {
    const rec = recognition.current;
    if (!rec) return;
    setError(null);
    if (listening) {
      rec.stop();
      setListening(false);
      return;
    }
    try {
      rec.start();
      setListening(true);
    } catch {
      // start() throws if called while already running; treat as a no-op.
    }
  }, [listening]);

  return { supported, listening, error, toggle };
}
