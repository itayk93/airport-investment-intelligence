import { useCallback, useRef, useState } from 'react';
import { sendChat, type OutboundMessage } from '../api/client';
import type { ToolCall } from '../api/types';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolTrace?: ToolCall[];
  isError?: boolean;
}

let seq = 0;
const nextId = () => `m${++seq}`;

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [lastTrace, setLastTrace] = useState<ToolCall[]>([]);
  const inFlight = useRef<AbortController | null>(null);

  const ask = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || pending) return;

      // Cancel any still-running request so a fast second question can't have its answer
      // arrive after the newer one and overwrite it.
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;

      const userMessage: ChatMessage = { id: nextId(), role: 'user', content: question };
      // Snapshot the history that will be sent, so the request reflects exactly what the
      // user sees rather than whatever state has become by the time the fetch fires.
      const outbound: OutboundMessage[] = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      setMessages((prev) => [...prev, userMessage]);
      setPending(true);

      try {
        const res = await sendChat(outbound, controller.signal);
        setLastTrace(res.tool_trace ?? []);
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: 'assistant',
            content: res.reply || 'No answer was returned.',
            toolTrace: res.tool_trace,
          },
        ]);
      } catch (err) {
        if (controller.signal.aborted) return;
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: 'assistant',
            content:
              err instanceof Error
                ? `Something went wrong reaching the agent: ${err.message}`
                : 'Something went wrong reaching the agent.',
            isError: true,
          },
        ]);
      } finally {
        if (inFlight.current === controller) {
          inFlight.current = null;
          setPending(false);
        }
      }
    },
    [messages, pending],
  );

  const reset = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
    setMessages([]);
    setLastTrace([]);
    setPending(false);
  }, []);

  return { messages, pending, lastTrace, ask, reset };
}
