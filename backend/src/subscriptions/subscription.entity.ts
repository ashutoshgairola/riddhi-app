import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import { Account } from '../accounts/account.entity';
import { User } from '../users/user.entity';
import { PaymentMethod } from '../common/enums';

const num = {
  type: 'numeric' as const, precision: 18, scale: 2,
  transformer: { to: (v: number) => v, from: (v: string | null) => (v == null ? null : parseFloat(v)) },
};

export type SubscriptionCycle = 'monthly' | 'yearly';
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled';
export interface PriceHistoryEntry { amount: number; since: string }

@Entity('subscription')
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 200 })
  merchantDescriptor: string;

  @Column({ type: 'varchar', length: 16, default: '🔁' })
  emoji: string;

  @Column({ type: 'varchar', length: 20, default: '#a78bfa' })
  color: string;

  @Column({ ...num, default: 0 })
  amount: number;

  @Column({ type: 'varchar', length: 10, default: 'monthly' })
  cycle: SubscriptionCycle;

  @Column({ type: 'date' })
  nextRenewalDate: string;

  @Column({ type: 'date' })
  firstSeenDate: string;

  @Column({ type: 'varchar', length: 10, default: 'active' })
  status: SubscriptionStatus;

  @Column({ type: 'uuid', nullable: true })
  accountId: string | null;

  @ManyToOne(() => Account, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'accountId' })
  account: Account | null;

  @Column({ type: 'enum', enum: PaymentMethod, nullable: true })
  paymentMethod: PaymentMethod | null;

  @Column({ type: 'uuid', nullable: true })
  categoryId: string | null;

  @Column({ type: 'int', nullable: true })
  reminderDays: number | null;

  @Column({ type: 'jsonb', nullable: true })
  priceHistory: PriceHistoryEntry[] | null;

  @Column({ type: 'timestamptz', nullable: true })
  detailOpenedAt: Date | null;

  @Column({ type: 'date', nullable: true })
  lastReminderSentFor: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
