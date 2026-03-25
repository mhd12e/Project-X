import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Message } from './message.entity';

export enum ConversationType {
  CHAT = 'chat',
  CONTENT = 'content',
}

export enum ConversationStatus {
  ACTIVE = 'active',
  GENERATING = 'generating',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('conversations')
@Index(['userId', 'type', 'updatedAt'])
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: string;

  @Column({ type: 'enum', enum: ConversationType })
  type!: ConversationType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title!: string | null;

  @Column({ type: 'boolean', default: false })
  isPinned!: boolean;

  @Column({ type: 'int', nullable: true })
  pinnedOrder!: number | null;

  @Column({ type: 'enum', enum: ConversationStatus, default: ConversationStatus.ACTIVE })
  status!: ConversationStatus;

  @OneToMany(() => Message, (msg) => msg.conversation, { cascade: true })
  messages!: Message[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
