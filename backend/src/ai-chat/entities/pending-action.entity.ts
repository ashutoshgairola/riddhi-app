import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { ChatThread } from './chat-thread.entity';

export enum PendingActionStatus {
  PENDING = 'pending',
  EXECUTED = 'executed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

/** How long a pending action stays confirmable (checked lazily at confirm time). */
export const PENDING_ACTION_TTL_MS = 15 * 60 * 1000;

@Entity('chat_pending_action')
export class PendingAction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid' })
  threadId: string;

  @ManyToOne(() => ChatThread, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'threadId' })
  thread: ChatThread;

  @Column({ type: 'varchar', length: 100 })
  toolName: string;

  @Column({ type: 'jsonb' })
  input: Record<string, unknown>;

  @Column({ type: 'text' })
  summary: string;

  @Column({
    type: 'enum',
    enum: PendingActionStatus,
    default: PendingActionStatus.PENDING,
  })
  status: PendingActionStatus;

  @Column({ type: 'jsonb', nullable: true })
  resultData: unknown;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
