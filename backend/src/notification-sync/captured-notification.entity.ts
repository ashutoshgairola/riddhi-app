import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('captured_notification')
@Unique('uq_capture_user_dedup', ['userId', 'dedupKey'])
export class CapturedNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 255 })
  packageName: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  title: string | null;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'timestamptz' })
  postedAt: Date;

  @Column({ type: 'varchar', length: 64 })
  dedupKey: string;

  @Column({ type: 'boolean', default: false })
  @Index()
  analyzed: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
