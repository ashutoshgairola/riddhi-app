import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

@Entity('subscription_ignore')
@Index(['userId', 'merchantDescriptor'], { unique: true })
export class SubscriptionIgnore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 200 })
  merchantDescriptor: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
