import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { KnowledgeDocument } from './knowledge-document.entity';

@Entity('knowledge_chunks')
export class KnowledgeChunk {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => KnowledgeDocument, (doc) => doc.chunks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'documentId' })
  document!: KnowledgeDocument;

  @Column()
  documentId!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ length: 255 })
  section!: string;

  @Column({ length: 50 })
  contentType!: string;

  @Column({ length: 255 })
  topic!: string;

  @Column({ default: 0 })
  orderIndex!: number;

  @Column({ type: 'json', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;
}
