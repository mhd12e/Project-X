import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentContextService } from './agent-context.service';
import { OnboardingAnswer } from '../onboarding/onboarding-answer.entity';
import { User } from '../users/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OnboardingAnswer, User])],
  providers: [AgentContextService],
  exports: [AgentContextService],
})
export class AgentContextModule {}
