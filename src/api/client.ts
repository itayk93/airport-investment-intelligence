import { config } from '../config';
import type { AirportDataResponse, ChatResponse } from './types';

class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

const authHeaders = {
  Authorization: `Bearer ${config.publishableKey}`,
  'Content-Type': 'application/json',
};

async function parse<T>(res: Response): Promise<T> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiError(`Server returned a non-JSON response (${res.status})`, res.status);
  }
  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return body as T;
}

export async function fetchAirportData(signal?: AbortSignal): Promise<AirportDataResponse> {
  const res = await fetch(config.dataEndpoint, { headers: authHeaders, signal });
  return parse<AirportDataResponse>(res);
}

export interface OutboundMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function sendChat(
  messages: OutboundMessage[],
  signal?: AbortSignal,
): Promise<ChatResponse> {
  const res = await fetch(config.chatEndpoint, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ messages }),
    signal,
  });
  return parse<ChatResponse>(res);
}

export { ApiError };
