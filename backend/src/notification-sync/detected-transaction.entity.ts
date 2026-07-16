import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';
import { TransactionType, PaymentMethod, DetectedStatus } from '../common/enums';

@Entity('detected_transaction')
export class DetectedTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 255, nullable: true })
  merchant: string | null;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v == null ? null : parseFloat(v)),
    },
  })
  amount: number | null;

  @Column({ type: 'enum', enum: TransactionType, default: TransactionType.EXPENSE })
  type: TransactionType;

  @Column({ type: 'varchar', length: 100, nullable: true })
  suggestedCategory: string | null;

  @Column({ type: 'uuid', nullable: true })
  accountId: string | null;

  @Column({ type: 'enum', enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 2,
    default: 0.5,
    transformer: {
      to: (v: number) => v,
      from: (v: string) => parseFloat(v),
    },
  })
  confidence: number;

  @Column({ type: 'enum', enum: DetectedStatus, default: DetectedStatus.PENDING })
  @Index()
  status: DetectedStatus;

  @Column({ type: 'simple-array', default: '' })
  sourceKeys: string[];

  @Column({ type: 'uuid', nullable: true })
  transactionId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  postedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
