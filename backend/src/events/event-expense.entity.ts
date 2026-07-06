import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Event } from './event.entity';
import { TransactionCategory } from '../categories/category.entity';

const numericTransformer = {
  to: (value: number) => value,
  from: (value: string) => parseFloat(value),
};

@Entity('event_expense')
export class EventExpense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  eventId: string;

  @ManyToOne(() => Event, (e) => e.expenses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eventId' })
  event: Event;

  @Column({ type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => TransactionCategory, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'categoryId' })
  category: TransactionCategory;

  @Column({ type: 'varchar', length: 255 })
  label: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, transformer: numericTransformer })
  planned: number;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0, transformer: numericTransformer })
  actual: number;

  @Column({ type: 'boolean', default: false })
  paid: boolean;

  /** The linked real transaction while paid; null when unpaid. */
  @Column({ type: 'uuid', nullable: true })
  transactionId: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
