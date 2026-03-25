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

export enum ArtifactType {
  IMAGE = 'image',
  DOCUMENT = 'document',
  VIDEO = 'video',
  FILE = 'file',
}

export enum ArtifactSource {
  CONTENT = 'content',
  KNOWLEDGE = 'knowledge',
  CHAT = 'chat',
  AGENT = 'agent',
  UPLOAD = 'upload',
}

@Entity('artifacts')
@Index(['userId', 'createdAt'])
@Index(['type', 'createdAt'])
@Index(['source', 'createdAt'])
export class Artifact {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user!: User | null;

  @Column({ type: 'varchar', nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'enum', enum: ArtifactType })
  type!: ArtifactType;

  @Column({ type: 'enum', enum: ArtifactSource })
  source!: ArtifactSource;

  @Column({ type: 'varchar', length: 100, nullable: true })
  mimeType!: string | null;

  /** Relative path within /app/uploads (e.g. "generated/abc.png") */
  @Column({ type: 'varchar', length: 500 })
  filePath!: string;

  @Column({ type: 'bigint', nullable: true })
  fileSize!: number | null;

  /** ID of the entity that created this artifact (e.g. contentImage.id, document.id) */
  @Column({ type: 'varchar', length: 255, nullable: true })
  sourceId!: string | null;

  /** Human-readable source context (e.g. "Content idea: Marketing Campaign") */
  @Column({ type: 'varchar', length: 500, nullable: true })
  sourceContext!: string | null;

  @Column({ type: 'json', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;
}
