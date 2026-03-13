import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnboardingAnswer } from '../onboarding/onboarding-answer.entity';
import { User } from '../users/user.entity';

/**
 * Builds a context block containing the user's profile and business preferences.
 * Injected into every AI agent prompt so the agent understands who it's working for.
 *
 * To use: call `getContextBlock(userId)` and prepend the result to your agent prompt.
 */
@Injectable()
export class AgentContextService {
  constructor(
    @InjectRepository(OnboardingAnswer)
    private readonly answersRepo: Repository<OnboardingAnswer>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  /**
   * Build a markdown context block for the given user.
   * Returns an empty string if the user is not found (graceful degradation).
   */
  async getContextBlock(userId: string): Promise<string> {
    const [user, answers] = await Promise.all([
      this.usersRepo.findOne({ where: { id: userId } }),
      this.answersRepo.find({ where: { userId } }),
    ]);

    if (!user) return '';

    const sections: string[] = [
      '# User Context',
      '',
      `- **Name:** ${user.name}`,
      `- **Email:** ${user.email}`,
    ];

    const answerMap = new Map(answers.map((a) => [a.stepId, a.answer]));

    // Business context
    const bc = answerMap.get('business_context');
    if (bc) {
      sections.push('');
      sections.push('## Business Context');
      if (bc.companyName) sections.push(`- **Company:** ${bc.companyName}`);
      const industry =
        bc.industry === 'Other'
          ? (bc.customIndustry as string) || 'Other'
          : (bc.industry as string);
      if (industry) sections.push(`- **Industry:** ${industry}`);
      if (bc.description) sections.push(`- **Description:** ${bc.description}`);
    }

    // Usage goals
    const goals = answerMap.get('usage_goals');
    if (goals) {
      const goalList = (goals.goals as string[]) ?? [];
      const custom = (goals.customGoal as string) ?? '';
      if (goalList.length > 0 || custom) {
        sections.push('');
        sections.push('## User Goals');
        for (const g of goalList) {
          sections.push(`- ${g}`);
        }
        if (custom) sections.push(`- ${custom}`);
      }
    }

    // Theme preference (light context — agents may reference it)
    const theme = answerMap.get('theme_preference');
    if (theme?.theme) {
      sections.push('');
      sections.push(`## Preferences`);
      sections.push(`- **Theme:** ${theme.theme}`);
    }

    return sections.join('\n');
  }
}
