import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Theme, StartOfWeek } from '../common/enums';
import { User } from './user.entity';

const numericTransformer = {
  to: (value: number) => value,
  from: (value: string | null) => (value == null ? null : parseFloat(value)),
};

@Entity('user_preferences')
export class UserPreferences {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 10, default: 'INR' })
  currency: string;

  @Column({ type: 'varchar', length: 50, default: 'DD/MM/YYYY' })
  dateFormat: string;

  @Column({
    type: 'enum',
    enum: Theme,
    default: Theme.SYSTEM,
  })
  theme: Theme;

  @Column({
    type: 'enum',
    enum: StartOfWeek,
    default: StartOfWeek.MONDAY,
  })
  startOfWeek: StartOfWeek;

  @Column({ type: 'varchar', length: 10, default: 'en' })
  language: string;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  monthlyIncome: number | null;

  @Column({ type: 'text', array: true, default: '{}' })
  focusGoals: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  selectedBanks: string[];

  @Column({ type: 'boolean', default: false })
  smsSyncEnabled: boolean;

  @Column({ type: 'boolean', default: false })
  biometricEnabled: boolean;

  @Column({ type: 'boolean', default: false })
  onboardingCompleted: boolean;

  @Column({ type: 'uuid', unique: true })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
