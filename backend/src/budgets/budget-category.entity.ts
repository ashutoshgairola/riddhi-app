import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Budget } from './budget.entity';

const numericTransformer = {
  to: (value: number) => value,
  from: (value: string) => parseFloat(value),
};

@Entity('budget_category')
export class BudgetCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    transformer: numericTransformer,
  })
  allocated: number;

  @Column({ type: 'simple-array', default: '' })
  categoryIds: string[];

  @Column({ type: 'varchar', length: 50, nullable: true })
  color: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  icon: string | null;

  @Column({ type: 'boolean', default: false })
  rollover: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid' })
  budgetId: string;

  @ManyToOne(() => Budget, (budget) => budget.categories, {
    onDelete: 'CASCADE',
    orphanedRowAction: 'delete',
  })
  @JoinColumn({ name: 'budgetId' })
  budget: Budget;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
