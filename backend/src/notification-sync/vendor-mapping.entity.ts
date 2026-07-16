import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from '../users/user.entity';
import { TransactionCategory } from '../categories/category.entity';

/** A set-once per-user vendor rule: any detection whose normalized merchant
 * equals `matchKey` is renamed to `displayName`, categorized as `categoryId`,
 * and auto-confirmed when its payment source resolved. */
@Entity('vendor_mapping')
@Unique(['userId', 'matchKey'])
export class VendorMapping {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /** `normalizeDescriptor(detected merchant)` — see detect-subscriptions.ts. */
  @Column({ type: 'varchar', length: 255 })
  matchKey: string;

  @Column({ type: 'varchar', length: 255 })
  displayName: string;

  // A rule without its category is meaningless — CASCADE drops the rule and
  // the vendor simply falls back to normal review.
  @Column({ type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => TransactionCategory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'categoryId' })
  category: TransactionCategory;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
