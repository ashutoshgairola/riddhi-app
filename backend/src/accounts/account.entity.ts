import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AccountType } from '../common/enums';
import { User } from '../users/user.entity';

@Entity('account')
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({
    type: 'enum',
    enum: AccountType,
    default: AccountType.OTHER,
  })
  type: AccountType;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  balance: number;

  @Column({ type: 'varchar', length: 10, default: 'INR' })
  currency: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  institutionName: string | null;

  @Column({ type: 'text', nullable: true })
  institutionLogo: string | null;

  @Column({ type: 'boolean', default: false })
  isConnected: boolean;

  @Column({ type: 'boolean', default: true })
  includeInNetWorth: boolean;

  @Column({ type: 'varchar', length: 20, nullable: true })
  color: string | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  lastUpdated: Date;

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
