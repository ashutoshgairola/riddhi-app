// SSE wire format for POST /ai-chat/stream. Each event is sent as a plain
// `data: <json>\n\n` frame; `: ping` comment frames act as heartbeats.
// Mirrored at mobile/src/ai/chatEvents.ts — KEEP IN SYNC.
import { ConfirmationWidget, Widget } from './widgets';

export type ChatStreamEvent =
  | { type: 'message_start'; threadId: string; messageId: string }
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_start'; toolUseId: string; name: string; label: string }
  | { type: 'tool_end'; toolUseId: string; name: string; ok: boolean }
  | { type: 'widget'; widget: Widget }
  | { type: 'confirmation_required'; widget: ConfirmationWidget }
  | { type: 'message_end'; messageId: string; stopReason: string }
  | { type: 'error'; message: string; retryable: boolean };

export type ChatStreamEmitter = (event: ChatStreamEvent) => void;
