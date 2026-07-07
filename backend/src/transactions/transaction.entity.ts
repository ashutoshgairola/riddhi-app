import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TransactionType, TransactionStatus, PaymentMethod } from '../common/enums';
import { User } from '../users/user.entity';
import { Account } from '../accounts/account.entity';
import { TransactionCategory } from '../categories/category.entity';
import { Event } from '../events/event.entity';

export interface RecurringDetails {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  endDate?: string | null;
  nextDate?: string | null;
}

@Entity('transaction')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'timestamptz' })
  date: Date;

  @Column({ type: 'varchar', length: 500 })
  description: string;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  amount: number;

  @Column({
    type: 'enum',
    enum: TransactionType,
  })
  type: TransactionType;

  @Column({ type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => TransactionCategory, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'categoryId' })
  category: TransactionCategory;

  @Column({ type: 'uuid', nullable: true })
  accountId: string | null;

  @ManyToOne(() => Account, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'accountId' })
  account: Account | null;

  /** Destination account for a `transfer`: credited when the source is debited. */
  @Column({ type: 'uuid', nullable: true })
  destinationAccountId: string | null;

  @ManyToOne(() => Account, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'destinationAccountId' })
  destinationAccount: Account | null;

  /** Set when this expense was logged by ticking an Event Planner item. */
  @Column({ type: 'uuid', nullable: true })
  eventId: string | null;

  @ManyToOne(() => Event, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'eventId' })
  event: Event | null;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.CLEARED,
  })
  status: TransactionStatus;

  @Column({ type: 'enum', enum: PaymentMethod, nullable: true })
  paymentMethod: PaymentMethod | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'simple-array', default: '' })
  tags: string[];

  @Column({ type: 'simple-array', default: '' })
  attachments: string[];

  @Column({ type: 'boolean', default: false })
  isRecurring: boolean;

  @Column({ type: 'jsonb', nullable: true })
  recurringDetails: RecurringDetails | null;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
