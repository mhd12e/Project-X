import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ChatConversation } from './chat-conversation.entity';

export type MessageRole = 'user' | 'assistant';

@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ChatConversation, (conv) => conv.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversationId' })
  conversation!: ChatConversation;

  @Column()
  conversationId!: string;

  @Column({ length: 20 })
  role!: MessageRole;

  @Column({ type: 'longtext' })
  content!: string;

  /** Tool calls, sources, and activity log for this message */
  @Column({ type: 'json', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ default: 0 })
  orderIndex!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
