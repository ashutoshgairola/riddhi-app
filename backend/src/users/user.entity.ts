import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('user')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255, select: false })
  password: string;

  @Column({ type: 'boolean', default: true })
  isFirstLogin: boolean;

  // Password-reset flow: only a SHA-256 hash of the emailed 6-digit code is
  // stored, never the code itself.
  @Column({ type: 'varchar', length: 128, nullable: true, select: false })
  resetTokenHash: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resetTokenExpiresAt: Date | null;

  // Wrong-code guesses against the current pending code. Capped to blunt
  // brute-forcing of the 6-digit space; reset to 0 on each new code request.
  @Column({ type: 'int', default: 0, select: false })
  resetAttempts: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
