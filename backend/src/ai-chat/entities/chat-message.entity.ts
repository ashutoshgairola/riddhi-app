import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ChatThread } from './chat-thread.entity';

/**
 * Message roles:
 * - 'user'      — the user's text ([{type:'text', text}]).
 * - 'assistant' — raw Anthropic content blocks (text/tool_use/thinking) plus
 *                 render-only blocks ({type:'widget'} / {type:'confirmation'})
 *                 that the mobile client draws but the model never sees.
 * - 'tool'      — the user-side tool_result blocks answering the previous
 *                 assistant tool_use blocks.
 * - 'event'     — confirm/cancel outcomes ([{type:'event_note', text}]);
 *                 audit trail, serialized into model context as a note.
 */
export type ChatMessageRole = 'user' | 'assistant' | 'tool' | 'event';

@Entity('chat_message')
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  threadId: string;

  @ManyToOne(() => ChatThread, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'threadId' })
  thread: ChatThread;

  @Column({ type: 'varchar', length: 16 })
  role: ChatMessageRole;

  @Column({ type: 'jsonb' })
  blocks: unknown[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
