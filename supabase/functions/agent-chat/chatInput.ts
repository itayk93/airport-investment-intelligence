export const MAX_MESSAGES = 20;
export const MAX_MESSAGE_CHARS = 2_000;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type ChatInputResult =
  | { ok: true; messages: ChatMessage[] }
  | { ok: false; error: string };

/** Validate the public JSON boundary before rate limiting or invoking paid services. */
export function parseChatInput(value: unknown): ChatInputResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'JSON body must be an object.' };
  }

  const messages = (value as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, error: 'messages[] required' };
  }

  const accepted: ChatMessage[] = [];
  for (const message of messages.slice(-MAX_MESSAGES)) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      return { ok: false, error: 'Each message must be an object.' };
    }
    const { role, content } = message as { role?: unknown; content?: unknown };
    // Untrusted system/tool roles are ignored. They must never enter model history.
    if (role !== 'user' && role !== 'assistant') continue;
    if (typeof content !== 'string') {
      return { ok: false, error: 'Message content must be a string.' };
    }
    accepted.push({ role, content: content.slice(0, MAX_MESSAGE_CHARS) });
  }

  if (!accepted.length || !accepted.some((message) => message.role === 'user')) {
    return { ok: false, error: 'At least one user message is required.' };
  }
  return { ok: true, messages: accepted };
}
