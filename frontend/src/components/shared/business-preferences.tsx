/**
 * Shared business preference form fields used by both onboarding and settings.
 * Single source of truth — any changes here reflect in both places.
 */

import { useState, useEffect } from 'react';
import { Building2, Target } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ---------------------------------------------------------------------------
// Constants (shared between onboarding + settings)
// ---------------------------------------------------------------------------

export const INDUSTRIES = [
  'Technology / SaaS',
  'Healthcare',
  'Finance / Banking',
  'E-commerce / Retail',
  'Education',
  'Manufacturing',
  'Real Estate',
  'Consulting / Professional Services',
  'Marketing / Advertising',
  'Legal',
  'Non-profit',
  'Government',
  'Other',
];

export const GOAL_OPTIONS = [
  'Document analysis & search',
  'Business intelligence & insights',
  'Knowledge management',
  'Automated reporting',
  'Customer support workflows',
  'Research & data exploration',
];

// ---------------------------------------------------------------------------
// Common interface
// ---------------------------------------------------------------------------

export interface PreferenceFieldProps {
  initialAnswer: Record<string, unknown>;
  onChange: (answer: Record<string, unknown>, valid: boolean) => void;
  /** When true, hides the icon header (for inline settings usage) */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Business Context fields
// ---------------------------------------------------------------------------

export function BusinessContextFields({
  initialAnswer,
  onChange,
  compact = false,
}: PreferenceFieldProps) {
  const [companyName, setCompanyName] = useState(
    (initialAnswer.companyName as string) ?? '',
  );
  const [industry, setIndustry] = useState(
    (initialAnswer.industry as string) ?? '',
  );
  const [customIndustry, setCustomIndustry] = useState(
    (initialAnswer.customIndustry as string) ?? '',
  );
  const [description, setDescription] = useState(
    (initialAnswer.description as string) ?? '',
  );

  const isOther = industry === 'Other';
  const effectiveIndustry = isOther ? customIndustry.trim() : industry;

  useEffect(() => {
    const valid = companyName.trim().length > 0 && effectiveIndustry.length > 0;
    onChange(
      { companyName, industry, customIndustry, description },
      valid,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyName, industry, customIndustry, description]);

  return (
    <div className="space-y-5">
      {!compact && (
        <div className="flex items-center gap-3 text-primary">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold">About your business</h3>
            <p className="text-xs text-muted-foreground">
              Help the AI understand your context for better insights.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="companyName">Company / Organization name</Label>
          <Input
            id="companyName"
            placeholder="Acme Corp"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Industry</Label>
          <Select value={industry} onValueChange={setIndustry}>
            <SelectTrigger>
              <SelectValue placeholder="Select your industry" />
            </SelectTrigger>
            <SelectContent>
              {INDUSTRIES.map((ind) => (
                <SelectItem key={ind} value={ind}>
                  {ind}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isOther && (
            <Input
              placeholder="Enter your industry..."
              value={customIndustry}
              onChange={(e) => setCustomIndustry(e.target.value)}
              autoFocus
            />
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">
            Brief description <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="description"
            placeholder="What does your company do? What kind of documents will you upload?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="resize-none"
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Usage Goals fields
// ---------------------------------------------------------------------------

export function UsageGoalsFields({
  initialAnswer,
  onChange,
  compact = false,
}: PreferenceFieldProps) {
  const [selectedGoals, setSelectedGoals] = useState<string[]>(
    (initialAnswer.goals as string[]) ?? [],
  );
  const [customGoal, setCustomGoal] = useState(
    (initialAnswer.customGoal as string) ?? '',
  );

  useEffect(() => {
    const valid = selectedGoals.length > 0 || customGoal.trim().length > 0;
    onChange({ goals: selectedGoals, customGoal }, valid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGoals, customGoal]);

  const toggleGoal = (goal: string) => {
    setSelectedGoals((prev) =>
      prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal],
    );
  };

  return (
    <div className="space-y-5">
      {!compact && (
        <div className="flex items-center gap-3 text-primary">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Target className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold">Your goals</h3>
            <p className="text-xs text-muted-foreground">
              What do you want to achieve with Project X?
            </p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Select all that apply</Label>
          <div className="grid grid-cols-2 gap-2">
            {GOAL_OPTIONS.map((goal) => {
              const active = selectedGoals.includes(goal);
              return (
                <button
                  key={goal}
                  type="button"
                  onClick={() => toggleGoal(goal)}
                  className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-all duration-200 ${
                    active
                      ? 'border-primary bg-primary/5 text-primary shadow-sm'
                      : 'border-border hover:border-primary/40 hover:bg-muted/50'
                  }`}
                >
                  {goal}
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="customGoal">
            Anything else? <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="customGoal"
            placeholder="Tell us more about what you're looking to do..."
            value={customGoal}
            onChange={(e) => setCustomGoal(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
