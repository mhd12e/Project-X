import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot,
  ArrowRight,
  ArrowLeft,
  Building2,
  Target,
  Loader2,
  FileSearch,
  BrainCircuit,
  MessagesSquare,
  BarChart3,
  Sun,
  Moon,
  Monitor,
  Clock,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { Meta } from '@/components/shared/meta';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAppDispatch, useAppSelector } from '@/store';
import { setOnboardingCompleted } from '@/store/auth.slice';
import { useTheme, type Theme } from '@/hooks/use-theme';
import api from '@/lib/api';

// ---------------------------------------------------------------------------
// Reusable fade-in wrapper
// ---------------------------------------------------------------------------

function FadeIn({
  children,
  delay = 0,
  duration = 600,
  className = '',
  show = true,
}: {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
  show?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay, show]);

  return (
    <div
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(12px)',
        transition: `opacity ${duration}ms cubic-bezier(0.16, 1, 0.3, 1), transform ${duration}ms cubic-bezier(0.16, 1, 0.3, 1)`,
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Welcome intro (client-side only — not a backend step)
// ---------------------------------------------------------------------------

const CAPABILITIES = [
  { icon: FileSearch, label: 'Search & analyze your documents' },
  { icon: BrainCircuit, label: 'AI-powered business insights' },
  { icon: MessagesSquare, label: 'Chat with your knowledge base' },
  { icon: BarChart3, label: 'Track everything in real time' },
];

function WelcomeIntro({
  userName,
  onContinue,
}: {
  userName: string;
  onContinue: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <FadeIn delay={200}>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground mb-6 mx-auto">
          <Bot className="h-7 w-7" />
        </div>
      </FadeIn>

      <FadeIn delay={500}>
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          Welcome to Project X{userName ? `, ${userName}` : ''}!
        </h1>
      </FadeIn>

      <FadeIn delay={800}>
        <p className="text-muted-foreground max-w-md mb-10">
          Your AI-powered workspace for business intelligence and operations.
        </p>
      </FadeIn>

      <div className="grid grid-cols-2 gap-3 max-w-md w-full mb-10">
        {CAPABILITIES.map((cap, i) => (
          <FadeIn key={cap.label} delay={1100 + i * 150}>
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 text-left">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <cap.icon className="h-4 w-4" />
              </div>
              <span className="text-sm text-foreground/80">{cap.label}</span>
            </div>
          </FadeIn>
        ))}
      </div>

      <FadeIn delay={1900}>
        <div className="flex items-center gap-2 text-muted-foreground/60 text-xs mb-8">
          <Clock className="h-3.5 w-3.5" />
          <span>This will only take about 2 minutes</span>
        </div>
      </FadeIn>

      <FadeIn delay={2200}>
        <Button size="lg" onClick={onContinue} className="gap-2 px-8">
          Get Started
          <ArrowRight className="h-4 w-4" />
        </Button>
      </FadeIn>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step component interface
// ---------------------------------------------------------------------------

interface StepComponentProps {
  initialAnswer: Record<string, unknown>;
  onChange: (answer: Record<string, unknown>, valid: boolean) => void;
}

// ---------------------------------------------------------------------------
// Step: Theme preference
// ---------------------------------------------------------------------------

const THEME_OPTIONS: { value: Theme; icon: typeof Sun; label: string; desc: string }[] = [
  { value: 'system', icon: Monitor, label: 'System', desc: 'Follows your device settings' },
  { value: 'light', icon: Sun, label: 'Light', desc: 'Clean and bright' },
  { value: 'dark', icon: Moon, label: 'Dark', desc: 'Easy on the eyes' },
];

function ThemePreferenceStep({ initialAnswer, onChange }: StepComponentProps) {
  const { theme, setTheme } = useTheme();
  const [selected, setSelected] = useState<Theme>(
    (initialAnswer.theme as Theme) ?? theme,
  );

  useEffect(() => {
    onChange({ theme: selected }, true);
    setTheme(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 text-primary">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Monitor className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-semibold">Choose your theme</h3>
          <p className="text-xs text-muted-foreground">
            Pick how you want Project X to look.
          </p>
        </div>
      </div>

      <div className="grid gap-3">
        {THEME_OPTIONS.map((opt) => {
          const active = selected === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSelected(opt.value)}
              className={`flex items-center gap-4 rounded-xl border px-4 py-4 text-left transition-all duration-200 ${
                active
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border hover:border-primary/30 hover:bg-muted/30'
              }`}
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                  active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                <opt.icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">{opt.label}</div>
                <div className="text-xs text-muted-foreground">{opt.desc}</div>
              </div>
              {active && (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-3 w-3" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step: Business context
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Step: Usage goals
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Step component registry
// ---------------------------------------------------------------------------

const STEP_COMPONENTS: Record<string, React.ComponentType<StepComponentProps>> = {
  theme_preference: ThemePreferenceStep,
  business_context: BusinessContextStep,
  usage_goals: UsageGoalsStep,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Phase enum: intro → steps → finishing
// ---------------------------------------------------------------------------

type Phase = 'intro' | 'steps' | 'finishing';

// ---------------------------------------------------------------------------
// Main onboarding page
// ---------------------------------------------------------------------------

export function OnboardingPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user);

  const [phase, setPhase] = useState<Phase>('intro');
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Record<string, unknown>>>({});
  const [validity, setValidity] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Transition state for step crossfades
  const [stepVisible, setStepVisible] = useState(true);
  const [introExiting, setIntroExiting] = useState(false);
  const pendingIdx = useRef<number | null>(null);

  // Fetch onboarding status on mount
  useEffect(() => {
    api
      .get<OnboardingStatus>('/onboarding/status')
      .then(({ data }) => {
        setStatus(data);
        if (data.completed) {
          dispatch(setOnboardingCompleted());
          navigate('/app', { replace: true });
        } else {
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
  // Progress: intro is 0%, then each step fills proportionally
  const progressPercent =
    phase === 'intro' ? 0 : totalSteps > 0 ? ((currentIdx + 1) / totalSteps) * 100 : 0;

  const handleChange = useCallback(
    (answer: Record<string, unknown>, valid: boolean) => {
      if (!currentStep) return;
      setAnswers((prev) => ({ ...prev, [currentStep.id]: answer }));
      setValidity((prev) => ({ ...prev, [currentStep.id]: valid }));
    },
    [currentStep],
  );

  const transitionToStep = (idx: number) => {
    setStepVisible(false);
    pendingIdx.current = idx;
    setTimeout(() => {
      setCurrentIdx(idx);
      pendingIdx.current = null;
      setStepVisible(true);
    }, 350);
  };

  // Transition state for steps → finishing crossfade
  const [stepsExiting, setStepsExiting] = useState(false);

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
        // Fade out steps phase first, then show finishing
        setStepsExiting(true);
        setTimeout(() => {
          setPhase('finishing');
        }, 500);
        setTimeout(() => {
          dispatch(setOnboardingCompleted());
          navigate('/app', { replace: true });
        }, 2500);
      } else if (currentIdx < totalSteps - 1) {
        transitionToStep(currentIdx + 1);
      }
    } catch {
      toast.error('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (currentIdx > 0) transitionToStep(currentIdx - 1);
  };

  const handleStartOnboarding = () => {
    setIntroExiting(true);
    setTimeout(() => setPhase('steps'), 500);
  };

  const isCurrentValid = currentStep ? validity[currentStep.id] === true : false;
  const StepComponent = currentStep ? STEP_COMPONENTS[currentStep.id] : null;
  const firstName = user?.name?.split(' ')[0] ?? '';

  if (loadingStatus) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // -- Finishing phase: staggered success animation --
  if (phase === 'finishing') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Meta title="Onboarding" />
        <div className="flex flex-col items-center gap-5 text-center">
          <FadeIn delay={100} duration={600}>
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary mx-auto">
              <Check className="h-8 w-8" />
            </div>
          </FadeIn>
          <FadeIn delay={400} duration={600}>
            <h2 className="text-2xl font-bold tracking-tight">You&apos;re all set!</h2>
          </FadeIn>
          <FadeIn delay={650} duration={600}>
            <p className="text-sm text-muted-foreground">Taking you to your workspace...</p>
          </FadeIn>
          <FadeIn delay={900} duration={600}>
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/50 mt-2" />
          </FadeIn>
        </div>
      </div>
    );
  }

  // -- Welcome intro phase --
  if (phase === 'intro') {
    return (
      <div
        className="flex min-h-screen flex-col bg-background transition-all duration-500 ease-out"
        style={{
          opacity: introExiting ? 0 : 1,
          transform: introExiting ? 'scale(0.98)' : 'scale(1)',
        }}
      >
        <Meta title="Welcome" />
        <div className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-lg">
            <WelcomeIntro userName={firstName} onContinue={handleStartOnboarding} />
          </div>
        </div>
      </div>
    );
  }

  // -- Steps phase --
  return (
    <div
      className="flex min-h-screen flex-col bg-background transition-all duration-500 ease-out"
      style={{
        opacity: stepsExiting ? 0 : 1,
        transform: stepsExiting ? 'scale(0.97) translateY(-8px)' : 'scale(1) translateY(0)',
      }}
    >
      <Meta title="Onboarding" />

      {/* Top bar with progress */}
      <FadeIn delay={100} duration={400}>
        <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="mx-auto flex max-w-2xl items-center gap-4 px-6 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Bot className="h-4 w-4" />
              </div>
              <span className="text-sm font-semibold tracking-tight">Onboarding</span>
            </div>
            <div className="flex flex-1 items-center gap-3">
              <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">
                {currentIdx + 1}/{totalSteps}
              </span>
            </div>
          </div>
        </div>
      </FadeIn>

      {/* Content */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg space-y-6">
          {/* Step card with crossfade */}
          <div
            style={{
              opacity: stepVisible ? 1 : 0,
              transform: stepVisible ? 'translateY(0)' : 'translateY(8px)',
              transition: 'opacity 350ms cubic-bezier(0.16, 1, 0.3, 1), transform 350ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
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
          </div>

          {/* Navigation */}
          <FadeIn delay={200} duration={400}>
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
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      i === currentIdx
                        ? 'w-4 bg-primary'
                        : i < currentIdx
                          ? 'w-1.5 bg-primary/40'
                          : 'w-1.5 bg-muted-foreground/20'
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
                  <>
                    Finish
                    <Check className="h-3.5 w-3.5" />
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </Button>
            </div>
          </FadeIn>

          <FadeIn delay={300} duration={400}>
            <p className="text-center text-[11px] text-muted-foreground/60">
              You can update these later in Settings.
            </p>
          </FadeIn>
        </div>
      </div>
    </div>
  );
}
