import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, ArrowRight, ArrowLeft, Building2, Target, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Meta } from '@/components/shared/meta';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAppDispatch, useAppSelector } from '@/store';
import { setOnboardingCompleted } from '@/store/auth.slice';
import api from '@/lib/api';

// ---------------------------------------------------------------------------
// Modular step registry
//
// To add a new onboarding step:
//   1. Add a backend step definition in onboarding-steps.ts
//   2. Create a StepComponent below and add it to STEP_COMPONENTS
// ---------------------------------------------------------------------------

interface StepComponentProps {
  /** Pre-filled answer from a previous session (if any) */
  initialAnswer: Record<string, unknown>;
  /** Called when user fills the form — parent tracks validity */
  onChange: (answer: Record<string, unknown>, valid: boolean) => void;
}

// -- Step 1: Business Context ------------------------------------------------

function BusinessContextStep({ initialAnswer, onChange }: StepComponentProps) {
  const [companyName, setCompanyName] = useState(
    (initialAnswer.companyName as string) ?? '',
  );
  const [industry, setIndustry] = useState(
    (initialAnswer.industry as string) ?? '',
  );
  const [description, setDescription] = useState(
    (initialAnswer.description as string) ?? '',
  );

  useEffect(() => {
    const valid = companyName.trim().length > 0 && industry.trim().length > 0;
    onChange({ companyName, industry, description }, valid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyName, industry, description]);

  return (
    <div className="space-y-5">
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

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="companyName">Company / Organization name</Label>
          <Input
            id="companyName"
            placeholder="Acme Corp"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="industry">Industry</Label>
          <Input
            id="industry"
            placeholder="e.g. SaaS, Healthcare, Finance..."
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
          />
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

// -- Step 2: Usage Goals -----------------------------------------------------

const GOAL_OPTIONS = [
  'Document analysis & search',
  'Business intelligence & insights',
  'Knowledge management',
  'Automated reporting',
  'Customer support workflows',
  'Research & data exploration',
];

function UsageGoalsStep({ initialAnswer, onChange }: StepComponentProps) {
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
                  className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                    active
                      ? 'border-primary bg-primary/5 text-primary'
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

// -- Step component registry -------------------------------------------------

const STEP_COMPONENTS: Record<string, React.ComponentType<StepComponentProps>> = {
  business_context: BusinessContextStep,
  usage_goals: UsageGoalsStep,
};

// -- Types -------------------------------------------------------------------

interface OnboardingStepStatus {
  id: string;
  title: string;
  description: string;
  completed: boolean;
}

interface OnboardingStatus {
  steps: OnboardingStepStatus[];
  completed: boolean;
}

// -- Main onboarding page ----------------------------------------------------

export function OnboardingPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user);

  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Record<string, unknown>>>({});
  const [validity, setValidity] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Fetch onboarding status on mount
  useEffect(() => {
    api
      .get<OnboardingStatus>('/onboarding/status')
      .then(({ data }) => {
        setStatus(data);
        // If already completed (e.g. refreshed after finishing), redirect
        if (data.completed) {
          dispatch(setOnboardingCompleted());
          navigate('/app', { replace: true });
        } else {
          // Start on the first incomplete step
          const firstIncomplete = data.steps.findIndex((s) => !s.completed);
          if (firstIncomplete >= 0) setCurrentIdx(firstIncomplete);
        }
      })
      .catch(() => toast.error('Failed to load onboarding status'))
      .finally(() => setLoadingStatus(false));
  }, [dispatch, navigate]);

  const steps = status?.steps ?? [];
  const totalSteps = steps.length;
  const currentStep = steps[currentIdx];
  const progressPercent = totalSteps > 0 ? ((currentIdx + 1) / totalSteps) * 100 : 0;

  const handleChange = useCallback(
    (answer: Record<string, unknown>, valid: boolean) => {
      if (!currentStep) return;
      setAnswers((prev) => ({ ...prev, [currentStep.id]: answer }));
      setValidity((prev) => ({ ...prev, [currentStep.id]: valid }));
    },
    [currentStep],
  );

  const handleNext = async () => {
    if (!currentStep) return;
    setSaving(true);
    try {
      const result = await api.post<OnboardingStatus>(
        `/onboarding/steps/${currentStep.id}`,
        { answer: answers[currentStep.id] ?? {} },
      );
      setStatus(result.data);

      if (result.data.completed) {
        dispatch(setOnboardingCompleted());
        navigate('/app', { replace: true });
      } else if (currentIdx < totalSteps - 1) {
        setCurrentIdx(currentIdx + 1);
      }
    } catch {
      toast.error('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (currentIdx > 0) setCurrentIdx(currentIdx - 1);
  };

  const isCurrentValid = currentStep ? validity[currentStep.id] === true : false;
  const StepComponent = currentStep ? STEP_COMPONENTS[currentStep.id] : null;

  if (loadingStatus) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Meta title="Onboarding" />

      {/* Top bar */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-2xl items-center gap-4 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Bot className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Onboarding</span>
          </div>
          <div className="flex flex-1 items-center gap-3">
            <div className="h-1.5 flex-1 rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {currentIdx + 1}/{totalSteps}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg space-y-6">
          {/* Welcome message on first step */}
          {currentIdx === 0 && (
            <div className="space-y-1 text-center">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
                <Sparkles className="h-3 w-3" />
                Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
              </div>
              <p className="text-sm text-muted-foreground">
                Let&apos;s set up your workspace. This only takes a minute.
              </p>
            </div>
          )}

          <Card className="shadow-sm">
            <CardContent className="p-6">
              {StepComponent && (
                <StepComponent
                  initialAnswer={answers[currentStep.id] ?? {}}
                  onChange={handleChange}
                />
              )}
            </CardContent>
          </Card>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              disabled={currentIdx === 0}
              className="gap-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Button>

            <div className="flex items-center gap-1.5">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full transition-colors ${
                    i === currentIdx
                      ? 'bg-primary'
                      : i < currentIdx
                        ? 'bg-primary/40'
                        : 'bg-muted-foreground/20'
                  }`}
                />
              ))}
            </div>

            <Button
              size="sm"
              onClick={handleNext}
              disabled={!isCurrentValid || saving}
              className="gap-1.5"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : currentIdx === totalSteps - 1 ? (
                'Finish'
              ) : (
                <>
                  Next
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </div>

          <p className="text-center text-[11px] text-muted-foreground/60">
            You can update these later in Settings.
          </p>
        </div>
      </div>
    </div>
  );
}
