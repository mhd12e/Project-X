import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnboardingAnswer } from './onboarding-answer.entity';
import { UsersService } from '../users/users.service';
import { ONBOARDING_STEPS } from './onboarding-steps';

@Injectable()
export class OnboardingService {
  constructor(
    @InjectRepository(OnboardingAnswer)
    private readonly answersRepo: Repository<OnboardingAnswer>,
    private readonly usersService: UsersService,
  ) {}

  async getStatus(userId: string) {
    const answers = await this.answersRepo.find({ where: { userId } });
    const completedStepIds = new Set(answers.map((a) => a.stepId));

    const steps = ONBOARDING_STEPS.map((step) => ({
      ...step,
      completed: completedStepIds.has(step.id),
    }));

    const allCompleted = steps.every((s) => s.completed);

    return { steps, completed: allCompleted };
  }

  async saveStepAnswer(
    userId: string,
    stepId: string,
    answer: Record<string, unknown>,
  ) {
    const step = ONBOARDING_STEPS.find((s) => s.id === stepId);
    if (!step) {
      throw new BadRequestException(`Unknown onboarding step: ${stepId}`);
    }

    // Upsert: replace if already answered
    const existing = await this.answersRepo.findOne({
      where: { userId, stepId },
    });
    if (existing) {
      existing.answer = answer;
      await this.answersRepo.save(existing);
    } else {
      const entity = this.answersRepo.create({ userId, stepId, answer });
      await this.answersRepo.save(entity);
    }

    // Check if all steps are now completed
    const status = await this.getStatus(userId);
    if (status.completed) {
      await this.usersService.completeOnboarding(userId);
    }

    return status;
  }
}
