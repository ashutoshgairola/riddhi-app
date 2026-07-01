import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AssetClass, InvestmentType } from '../common/enums';
import { User } from '../users/user.entity';
import { Account } from '../accounts/account.entity';
import { InvestmentTransaction } from './investment-transaction.entity';

const numericTransformer = {
  to: (value: number) => value,
  from: (value: string) => parseFloat(value),
};

@Entity('investment')
export class Investment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  ticker: string | null;

  @Column({ type: 'enum', enum: AssetClass })
  assetClass: AssetClass;

  @Column({ type: 'enum', enum: InvestmentType })
  type: InvestmentType;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 6,
    transformer: numericTransformer,
  })
  shares: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    transformer: numericTransformer,
  })
  purchasePrice: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    transformer: numericTransformer,
  })
  currentPrice: number;

  @Column({ type: 'timestamptz' })
  purchaseDate: Date;

  @Column({ type: 'uuid' })
  accountId: string;

  @ManyToOne(() => Account, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'accountId' })
  account: Account;

  @Column({
    type: 'numeric',
    precision: 8,
    scale: 4,
    nullable: true,
    transformer: numericTransformer,
  })
  dividendYield: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  sector: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  region: string | null;

  @Column({ type: 'varchar', length: 10, default: 'INR' })
  currency: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(
    () => InvestmentTransaction,
    (txn) => txn.investment,
    { cascade: true },
  )
  transactions: InvestmentTransaction[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
