import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';

export enum CredentialType {
  GEMINI = 'gemini',
}

@Entity('vault_credentials')
@Index(['userId', 'type'], { unique: true })
export class VaultCredential {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'varchar' })
  userId!: string;

  @Column({ type: 'enum', enum: CredentialType })
  type!: CredentialType;

  /** AES-256-GCM encrypted JSON blob: base64(iv + authTag + ciphertext) */
  @Column({ type: 'text' })
  encryptedData!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  label!: string | null;

  @Column({ type: 'boolean', default: false })
  verified!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
