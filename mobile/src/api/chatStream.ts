/**
 * chatStream — SSE client for POST /ai-chat/stream.
 *
 * Uses `expo/fetch` (WinterCG fetch, Expo SDK 56) because React Native's
 * global fetch cannot stream response bodies. Frames are plain
 * `data: <json>\n\n` lines; `: ping` comments are heartbeats and ignored.
 *
 * Error contract:
 *  - Failure before the first event → throws; caller should fall back to
 *    the buffered POST /ai-chat/messages endpoint.
 *  - Mid-stream drop → throws ChatStreamInterrupted; caller shows an error
 *    bubble + Retry (everything that completed is already persisted
 *    server-side and can be rehydrated via GET /ai-chat/threads/:id).
 */
import { fetch as expoFetch } from 'expo/fetch';

import type { ChatStreamEvent } from '../ai/chatEvents';
import { getAuthToken } from './client';

const BASE_URL = (process.env['EXPO_PUBLIC_API_URL'] ?? '').replace(/\/$/, '');

export class ChatStreamInterrupted extends Error {
  constructor(message = 'Stream interrupted') {
    super(message);
    this.name = 'ChatStreamInterrupted';
  }
}

export interface StreamChatOptions {
  threadId?: string;
  message: string;
  onEvent: (event: ChatStreamEvent) => void;
  signal?: AbortSignal;
}

export async function streamChat(opts: StreamChatOptions): Promise<void> {
  const token = getAuthToken();
  const res = await expoFetch(`${BASE_URL}/ai-chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ threadId: opts.threadId, message: opts.message }),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status} starting chat stream`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sawEvent = false;

  const flushFrame = (frame: string): void => {
    for (const line of frame.split('\n')) {
      if (!line.startsWith('data:')) continue; // ignores ": ping" heartbeats
      const json = line.slice(5).trim();
      if (!json) continue;
      try {
        const event = JSON.parse(json) as ChatStreamEvent;
        sawEvent = true;
        opts.onEvent(event);
      } catch {
        // Malformed frame — skip rather than kill the stream.
      }
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep = buffer.indexOf('\n\n');
      while (sep !== -1) {
        flushFrame(buffer.slice(0, sep));
        buffer = buffer.slice(sep + 2);
        sep = buffer.indexOf('\n\n');
      }
    }
    if (buffer.trim()) flushFrame(buffer);
  } catch (err) {
    if (sawEvent) throw new ChatStreamInterrupted();
    throw err;
  }
}
