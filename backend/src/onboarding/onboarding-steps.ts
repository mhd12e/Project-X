/**
 * Modular onboarding step definitions.
 *
 * To add a new step:
 *   1. Add an entry to this array with a unique `id`
 *   2. Add a matching step component in the frontend onboarding page
 *
 * Steps are presented to the user in array order.
 */
export interface OnboardingStepDefinition {
  /** Unique identifier for this step (used in API + storage) */
  id: string;
  /** Human-readable title */
  title: string;
  /** Short description shown to the user */
  description: string;
}

export const ONBOARDING_STEPS: OnboardingStepDefinition[] = [
  {
    id: 'theme_preference',
    title: 'Choose your theme',
    description: 'Pick how you want Project X to look.',
  },
  {
    id: 'claude_signin',
    title: 'Connect Claude Account',
    description: 'Link your Claude account to power the AI features.',
  },
  {
    id: 'business_context',
    title: 'About your business',
    description: 'Help us understand your business so the AI can provide better insights.',
  },
  {
    id: 'usage_goals',
    title: 'Your goals',
    description: 'Tell us what you want to achieve with Project X.',
  },
  {
    id: 'knowledge_upload',
    title: 'Teach Project X about your business',
    description: 'Upload your business documents so the AI can learn about your company.',
  },
];
