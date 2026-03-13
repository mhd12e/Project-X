import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnboardingAnswer } from './onboarding-answer.entity';
import { UsersService } from '../users/users.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { KnowledgeAgentService } from '../knowledge/knowledge-agent.service';
import { ONBOARDING_STEPS } from './onboarding-steps';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @InjectRepository(OnboardingAnswer)
    private readonly answersRepo: Repository<OnboardingAnswer>,
    private readonly usersService: UsersService,
    private readonly knowledgeService: KnowledgeService,
    private readonly knowledgeAgentService: KnowledgeAgentService,
  ) {}

  async getStatus(userId: string) {
    const answers = await this.answersRepo.find({ where: { userId } });
    const completedStepIds = new Set(answers.map((a) => a.stepId));

    const steps = ONBOARDING_STEPS.map((step) => ({
      ...step,
      completed: completedStepIds.has(step.id),
    }));

    const allCompleted = steps.every((s) => s.completed);

    // Check if knowledge documents are still being processed
    const knowledgeAnswer = answers.find((a) => a.stepId === 'knowledge_upload');
    const documentIds =
      (knowledgeAnswer?.answer?.['documentIds'] as string[] | undefined) ?? [];
    let processingDocuments = false;
    if (documentIds.length > 0) {
      const docs = await Promise.all(
        documentIds.map((id) => this.knowledgeService.findDocumentById(id)),
      );
      processingDocuments = docs.some(
        (d) => d && d.status !== 'completed' && d.status !== 'failed',
      );
    }

    return { steps, completed: allCompleted, processingDocuments };
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

    // Only mark onboarding complete if all steps are done AND
    // no documents are still being processed
    if (status.completed && !status.processingDocuments) {
      await this.usersService.completeOnboarding(userId);
    }

    return status;
  }

  /**
   * Returns all saved onboarding answers for a user, keyed by stepId.
   */
  async getAnswers(
    userId: string,
  ): Promise<Record<string, Record<string, unknown>>> {
    const answers = await this.answersRepo.find({ where: { userId } });
    const result: Record<string, Record<string, unknown>> = {};
    for (const a of answers) {
      result[a.stepId] = a.answer;
    }
    return result;
  }

  /**
   * Processes uploaded documents sequentially using the same knowledge pipeline.
   * Called after the user confirms document order during onboarding.
   * Completes onboarding after all documents finish processing.
   */
  async processDocumentsInOrder(
    documentIds: string[],
    userId: string,
  ): Promise<void> {
    for (const docId of documentIds) {
      const doc = await this.knowledgeService.findDocumentById(docId);
      if (!doc) {
        this.logger.warn(`Onboarding: document ${docId} not found, skipping`);
        continue;
      }
      try {
        await this.knowledgeAgentService.processDocument(doc);
      } catch (error) {
        this.logger.error(
          `Onboarding: failed to process document ${docId}: ${error}`,
        );
      }
    }

    // All documents processed — now complete onboarding
    const status = await this.getStatus(userId);
    if (status.completed) {
      await this.usersService.completeOnboarding(userId);
      this.logger.log(`Onboarding completed for user ${userId}`);
    }
  }
}
