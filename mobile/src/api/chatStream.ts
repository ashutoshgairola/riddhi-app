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
import { getAuthToken, notifySessionExpired, refreshAccessToken } from './client';
import { getBaseUrl } from './baseUrl';

export class ChatStreamInterrupted extends Error {
  constructor(message = 'Stream interrupted') {
    super(message);
    this.name = 'ChatStreamInterrupted';
  }
}

export interface StreamChatOptions {
  threadId?: string;
  message: string;
  /**
   * Client-generated per-turn id. On Retry the caller reuses the SAME id so the
   * backend dedupes the turn (replay/resume) instead of logging a second action.
   */
  clientMsgId?: string;
  onEvent: (event: ChatStreamEvent) => void;
  signal?: AbortSignal;
}

// No bytes for this long (heartbeats included — the backend beats every ~10s)
// means the socket is hung. Trip a clean interrupt instead of hanging forever.
const IDLE_TIMEOUT_MS = 25_000;

export async function streamChat(opts: StreamChatOptions): Promise<void> {
  const open = (token: string | null) =>
    expoFetch(`${getBaseUrl()}/ai-chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'ngrok-skip-browser-warning': 'true',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        threadId: opts.threadId,
        message: opts.message,
        clientMsgId: opts.clientMsgId,
      }),
      signal: opts.signal,
    });

  let res = await open(getAuthToken());
  // Mirror the REST client: a 401 triggers one transparent token refresh +
  // replay; if that still 401s the session is over.
  if (res.status === 401) {
    const token = await refreshAccessToken();
    if (token) res = await open(token);
    if (res.status === 401) notifySessionExpired();
  }

  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status} starting chat stream`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sawEvent = false;

  // Idle watchdog: reset on every read that returns bytes (heartbeats count —
  // they arrive as bytes even though flushFrame ignores them). Cancelling the
  // reader unblocks the pending read() so the loop tears down promptly.
  let idleTripped = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const clearIdle = (): void => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };
  const armIdle = (): void => {
    clearIdle();
    idleTimer = setTimeout(() => {
      idleTripped = true;
      void reader.cancel().catch(() => {});
    }, IDLE_TIMEOUT_MS);
  };

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
    armIdle();
    for (;;) {
      const { done, value } = await reader.read();
      // A watchdog-triggered cancel() surfaces as done/throw — treat as a drop.
      if (idleTripped) throw new ChatStreamInterrupted();
      if (done) break;
      armIdle(); // got bytes → the pipe is alive
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
    if (idleTripped || sawEvent) throw new ChatStreamInterrupted();
    throw err;
  } finally {
    clearIdle();
    // Release the socket on every exit path (normal end, throw, abort).
    await reader.cancel().catch(() => {});
  }
}
