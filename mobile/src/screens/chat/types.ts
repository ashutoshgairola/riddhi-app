/**
 * Chat block model — the mobile-side shape of a conversation. Assistant
 * messages are ordered block lists (text, widgets, tool-status chips,
 * errors) built incrementally from ChatStreamEvents and rehydrated from
 * persisted thread rows.
 */
import type { ChatStreamEvent } from '../../ai/chatEvents';
import type { Widget } from '../../ai/widgets';

export type ChatBlock =
  | { type: 'text'; text: string }
  | { type: 'widget'; widget: Widget }
  | { type: 'tool_status'; toolUseId: string; label: string; done: boolean; ok?: boolean }
  | { type: 'error'; message: string; retryable: boolean };

export interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  blocks: ChatBlock[];
  streaming?: boolean;
  /** Local receipt image uri (scan-a-bill mock). */
  image?: string;
}

let localId = 0;
export const nextLocalId = (): string => `local-${++localId}`;

export function userMsg(text: string): ChatMsg {
  return {
    id: nextLocalId(),
    role: 'user',
    blocks: [{ type: 'text', text }],
  };
}

/**
 * Applies one stream event to the message list, mutating only the trailing
 * assistant message (a new array/object is returned for React state).
 */
export function applyEvent(msgs: ChatMsg[], event: ChatStreamEvent): ChatMsg[] {
  const next = [...msgs];
  const trailing = (): ChatMsg => {
    const last = next[next.length - 1];
    if (last?.role === 'assistant' && last.streaming) {
      const copy = { ...last, blocks: [...last.blocks] };
      next[next.length - 1] = copy;
      return copy;
    }
    const created: ChatMsg = {
      id: nextLocalId(),
      role: 'assistant',
      blocks: [],
      streaming: true,
    };
    next.push(created);
    return created;
  };

  switch (event.type) {
    case 'message_start':
      trailing();
      break;
    case 'text_delta': {
      const msg = trailing();
      const last = msg.blocks[msg.blocks.length - 1];
      if (last?.type === 'text') {
        msg.blocks[msg.blocks.length - 1] = {
          type: 'text',
          text: last.text + event.delta,
        };
      } else {
        msg.blocks.push({ type: 'text', text: event.delta });
      }
      break;
    }
    case 'tool_start':
      trailing().blocks.push({
        type: 'tool_status',
        toolUseId: event.toolUseId,
        label: event.label,
        done: false,
      });
      break;
    case 'tool_end': {
      const msg = trailing();
      msg.blocks = msg.blocks.map((b) =>
        b.type === 'tool_status' && b.toolUseId === event.toolUseId
          ? { ...b, done: true, ok: event.ok }
          : b,
      );
      break;
    }
    case 'widget':
      trailing().blocks.push({ type: 'widget', widget: event.widget });
      break;
    case 'confirmation_required':
      trailing().blocks.push({ type: 'widget', widget: event.widget });
      break;
    case 'message_end': {
      const last = next[next.length - 1];
      if (last?.role === 'assistant') {
        next[next.length - 1] = { ...last, streaming: false };
      }
      break;
    }
    case 'error':
      trailing().blocks.push({
        type: 'error',
        message: event.message,
        retryable: event.retryable,
      });
      break;
  }

  return next;
}

interface StoredBlock {
  type?: string;
  text?: string;
  widget?: Widget;
}

/**
 * Rehydrates persisted thread rows (GET /ai-chat/threads/:id) into ChatMsgs.
 * Assistant rows carry raw Anthropic blocks (text/tool_use/thinking) plus
 * render-only widget/confirmation blocks; only text + widgets are drawn.
 */
export function hydrateMessages(
  rows: { id: string; role: 'user' | 'assistant'; blocks: unknown[] }[],
): ChatMsg[] {
  return rows
    .map((row) => {
      const blocks: ChatBlock[] = [];
      for (const raw of row.blocks as StoredBlock[]) {
        if (raw?.type === 'text' && raw.text) {
          blocks.push({ type: 'text', text: raw.text });
        } else if (
          (raw?.type === 'widget' || raw?.type === 'confirmation') &&
          raw.widget
        ) {
          blocks.push({ type: 'widget', widget: raw.widget });
        }
      }
      return { id: row.id, role: row.role, blocks };
    })
    .filter((m) => m.blocks.length > 0);
}
