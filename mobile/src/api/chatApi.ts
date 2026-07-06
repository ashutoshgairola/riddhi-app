/**
 * chatApi — REST surface for the AI chat (threads, confirm/cancel actions,
 * non-streaming fallback). Always talks to the live backend; chat has no
 * mock mode (streaming is the primary path, see chatStream.ts).
 */
import { apiClient } from './client';
import type { Widget } from '../ai/widgets';

export interface ThreadSummary {
  id: string;
  title: string;
  lastMessageAt: string;
}

export interface ThreadDetail {
  id: string;
  title: string;
  messages: {
    id: string;
    role: 'user' | 'assistant';
    blocks: unknown[];
  }[];
}

export interface BufferedTurn {
  threadId: string;
  messageId: string;
  blocks: {
    type: 'text' | 'widget' | 'confirmation';
    text?: string;
    widget?: Widget;
  }[];
}

export interface ActionResolution {
  status: 'pending' | 'executed' | 'cancelled' | 'expired';
  widgets: Widget[];
}

export const chatApi = {
  sendMessageBuffered(threadId: string | undefined, message: string) {
    return apiClient.post<BufferedTurn>('/ai-chat/messages', {
      threadId,
      message,
    });
  },
  listThreads() {
    return apiClient.get<ThreadSummary[]>('/ai-chat/threads');
  },
  getThread(id: string) {
    return apiClient.get<ThreadDetail>(`/ai-chat/threads/${id}`);
  },
  deleteThread(id: string) {
    return apiClient.delete<void>(`/ai-chat/threads/${id}`);
  },
  confirmAction(id: string) {
    return apiClient.post<ActionResolution>(`/ai-chat/actions/${id}/confirm`, {});
  },
  cancelAction(id: string) {
    return apiClient.post<ActionResolution>(`/ai-chat/actions/${id}/cancel`, {});
  },
};
