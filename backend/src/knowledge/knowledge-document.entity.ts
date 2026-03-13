import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { KnowledgeChunk } from './knowledge-chunk.entity';

export enum DocumentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('knowledge_documents')
export class KnowledgeDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 255 })
  filename!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  title!: string | null;

  @Column({ length: 100 })
  mimeType!: string;

  @Column()
  fileSize!: number;

  @Column({ length: 500 })
  filePath!: string;

  @Column({
    type: 'enum',
    enum: DocumentStatus,
    default: DocumentStatus.PENDING,
  })
  status!: DocumentStatus;

  @Column({ type: 'text', nullable: true })
  summary!: string | null;

  @Column({ type: 'json', nullable: true })
  topics!: string[] | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @OneToMany(() => KnowledgeChunk, (chunk) => chunk.document, { cascade: true })
  chunks!: KnowledgeChunk[];

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploadedById' })
  uploadedBy!: User;

  @Column()
  uploadedById!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
