import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('knowledge_conversations')
export class KnowledgeConversation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 20 })
  role!: string;

  @Column({ type: 'longtext' })
  content!: string;

  @Column({ default: 0 })
  orderIndex!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
