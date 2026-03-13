import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('onboarding_answers')
export class OnboardingAnswer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 100 })
  stepId!: string;

  @Column({ type: 'json' })
  answer!: Record<string, unknown>;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
