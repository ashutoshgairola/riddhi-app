import {
  Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { Account } from '../accounts/account.entity';

const num = {
  type: 'numeric' as const, precision: 18, scale: 2,
  transformer: { to: (v: number) => v, from: (v: string | null) => (v == null ? null : parseFloat(v)) },
};

@Entity('credit_card')
export class CreditCard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  accountId: string;

  @OneToOne(() => Account, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'accountId' })
  account: Account;

  @Column({ ...num, default: 0 })
  creditLimit: number;

  @Column({ type: 'int', default: 1 })
  statementDay: number;

  @Column({ type: 'int', default: 18 })
  graceDays: number;

  @Column({ type: 'varchar', length: 40, nullable: true })
  network: string | null;

  @Column({ type: 'varchar', length: 4, nullable: true })
  last4: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  rewardRate: string | null;

  // Optional exact-statement override (set by import/manual)
  @Column({ type: 'date', nullable: true })
  statementDate: string | null;

  @Column({ ...num, nullable: true })
  statementBilled: number | null;

  @Column({ ...num, nullable: true })
  statementMinDue: number | null;

  @Column({ type: 'date', nullable: true })
  statementDueDate: string | null;

  @Column({ ...num, nullable: true })
  statementRewards: number | null;

  @Column({ type: 'uuid' })
  userId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
