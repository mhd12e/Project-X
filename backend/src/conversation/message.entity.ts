import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Conversation } from './conversation.entity';
import type { ContentBlock } from './content-block.types';

export type MessageRole = 'user' | 'assistant' | 'system';

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Conversation, (conv) => conv.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversationId' })
  conversation!: Conversation;

  @Column()
  conversationId!: string;

  @Column({ length: 20 })
  role!: MessageRole;

  /** Structured content — ordered array of text, tool calls, thinking, etc. */
  @Column({ type: 'json' })
  contentBlocks!: ContentBlock[];

  /** Extracted plain text for search and display fallback */
  @Column({ type: 'longtext' })
  plainText!: string;

  @Column({ default: 0 })
  orderIndex!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
