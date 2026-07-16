import Anthropic from '@anthropic-ai/sdk';
import { ChatMessage } from './entities/chat-message.entity';

/** Cap on how many message rows feed the model's context per turn. */
const MAX_HISTORY_ROWS = 40;

/** Block types the mobile client renders but the model must never see. */
const RENDER_ONLY_TYPES = new Set(['widget', 'confirmation']);

interface TypedBlock {
  type?: string;
  text?: string;
}

/**
 * Rebuilds the Anthropic `messages` array from persisted ChatMessage rows.
 *
 * - Render-only blocks (widget/confirmation) are stripped from assistant rows.
 * - 'tool' rows become user-side tool_result turns.
 * - 'event' rows (confirm/cancel outcomes) become user-turn system notes so
 *   the model learns the outcome on the next turn.
 * - History is capped, then trimmed so it never starts with a tool_result
 *   turn whose matching tool_use was cut off (the API rejects that).
 */
export function rebuildHistory(rows: ChatMessage[]): Anthropic.MessageParam[] {
  const recent = rows.slice(-MAX_HISTORY_ROWS);

  // Never start mid tool-call: drop leading rows until a real user message.
  const firstUser = recent.findIndex((r) => r.role === 'user');
  const usable = firstUser === -1 ? [] : recent.slice(firstUser);

  const messages: Anthropic.MessageParam[] = [];

  for (const row of usable) {
    switch (row.role) {
      case 'user':
      case 'tool':
        messages.push({
          role: 'user',
          content: row.blocks as Anthropic.ContentBlockParam[],
        });
        break;
      case 'assistant': {
        const blocks = (row.blocks as TypedBlock[]).filter(
          (b) => !RENDER_ONLY_TYPES.has(b?.type ?? ''),
        );
        if (blocks.length > 0) {
          messages.push({
            role: 'assistant',
            content: blocks as Anthropic.ContentBlockParam[],
          });
        }
        break;
      }
      case 'event': {
        const note = (row.blocks as TypedBlock[])
          .map((b) => b?.text ?? '')
          .filter(Boolean)
          .join(' ');
        if (note) {
          messages.push({
            role: 'user',
            content: [{ type: 'text', text: `[system note] ${note}` }],
          });
        }
        break;
      }
    }
  }

  return messages;
}
