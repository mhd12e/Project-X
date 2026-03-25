import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';

export enum ActivityCategory {
  AUTH = 'auth',
  KNOWLEDGE = 'knowledge',
  CHAT = 'chat',
  RETRIEVAL = 'retrieval',
  AGENT = 'agent',
  CONTENT = 'content',
  SYSTEM = 'system',
}

export enum ActivityLevel {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

@Entity('activity_logs')
@Index(['category', 'createdAt'])
@Index(['userId', 'createdAt'])
@Index(['createdAt'])
export class ActivityLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: ActivityCategory })
  category!: ActivityCategory;

  @Column({ type: 'enum', enum: ActivityLevel, default: ActivityLevel.INFO })
  level!: ActivityLevel;

  @Column({ length: 100 })
  action!: string;

  @Column({ type: 'varchar', length: 500 })
  description!: string;

  @Column({ type: 'json', nullable: true })
  metadata!: Record<string, unknown> | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user!: User | null;

  @Column({ type: 'varchar', nullable: true })
  userId!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
