import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany,
  JoinColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { EventExpense } from './event-expense.entity';

const numericTransformer = {
  to: (value: number) => value,
  from: (value: string) => parseFloat(value),
};

@Entity('event')
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 16 })
  emoji: string;

  @Column({ type: 'varchar', length: 32 })
  color: string;

  /** YYYY-MM-DD; TypeORM `date` columns round-trip as strings. */
  @Column({ type: 'date', nullable: true })
  date: string | null;

  @Column({ type: 'numeric', precision: 18, scale: 2, transformer: numericTransformer })
  budget: number;

  @Column({ type: 'int', default: 0 })
  guests: number;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => EventExpense, (e) => e.event, { cascade: true })
  expenses: EventExpense[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
