import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot,
  ArrowRight,
  ArrowLeft,
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
  Upload,
  FileText,
  GripVertical,
  X,
  BookOpen,
  Activity,
  Wrench,
  Lightbulb,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Meta } from '@/components/shared/meta';
import {
  BusinessContextFields,
  UsageGoalsFields,
} from '@/components/shared/business-preferences';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useAppDispatch, useAppSelector } from '@/store';
import { setOnboardingCompleted, fetchMe } from '@/store/auth.slice';
import { useTheme, type Theme } from '@/hooks/use-theme';
import {
  useKnowledgeActivity,
  clearActivityForDocuments,
  type AgentActivity,
} from '@/hooks/use-knowledge-activity';
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
// Confetti canvas for the finishing celebration
// ---------------------------------------------------------------------------

function ConfettiCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    // Read the primary color from CSS
    const style = getComputedStyle(document.documentElement);
    const primaryHsl = style.getPropertyValue('--primary').trim();
    const baseColors = [
      `hsl(${primaryHsl})`,
      `hsl(${primaryHsl} / 0.8)`,
      `hsl(${primaryHsl} / 0.6)`,
      `hsl(${primaryHsl} / 0.4)`,
    ];
    // Add complementary accent colors
    const colors = [
      ...baseColors,
      '#fbbf24', // amber
      '#f472b6', // pink
      '#34d399', // emerald
      '#60a5fa', // blue
      '#a78bfa', // violet
    ];

    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      w: number;
      h: number;
      color: string;
      rotation: number;
      rotationSpeed: number;
      opacity: number;
      decay: number;
    }

    const particles: Particle[] = [];
    const W = window.innerWidth;
    const H = window.innerHeight;

    // Burst from two points (left-center and right-center)
    for (let i = 0; i < 120; i++) {
      const fromLeft = i % 2 === 0;
      particles.push({
        x: fromLeft ? W * 0.25 : W * 0.75,
        y: H * 0.4,
        vx: (Math.random() - 0.5) * 14,
        vy: -Math.random() * 12 - 4,
        w: Math.random() * 8 + 4,
        h: Math.random() * 6 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 12,
        opacity: 1,
        decay: 0.005 + Math.random() * 0.008,
      });
    }

    let raf: number;
    const gravity = 0.25;

    const animate = () => {
      ctx.clearRect(0, 0, W, H);
      let alive = 0;

      for (const p of particles) {
        if (p.opacity <= 0) continue;
        alive++;
        p.vy += gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;
        p.opacity -= p.decay;
        p.vx *= 0.99;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      if (alive > 0) {
        raf = requestAnimationFrame(animate);
      }
    };

    raf = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-20"
    />
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
  /** Signals from parent that processing has started (used by knowledge step) */
  processing?: boolean;
  /** Called when document processing finishes (used by knowledge step) */
  onProcessingDone?: () => void;
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
// Step: Claude Sign-in (OAuth)
// ---------------------------------------------------------------------------

type ClaudeConnectPhase = 'idle' | 'loading_url' | 'waiting_for_code' | 'exchanging' | 'success' | 'paste_token' | 'error';

function ClaudeConnectStep({ initialAnswer, onChange }: StepComponentProps) {
  const [phase, setPhase] = useState<ClaudeConnectPhase>('idle');
  const [code, setCode] = useState('');
  const [pasteToken, setPasteToken] = useState('');
  const [oauthUrl, setOauthUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [testOutput, setTestOutput] = useState('');
  const [testRunning, setTestRunning] = useState(false);
  const [testError, setTestError] = useState('');

  // Auto-complete if already configured
  useEffect(() => {
    if (initialAnswer.completed) {
      setPhase('success');
      onChange({ completed: true }, true);
      return;
    }
    api.get<{ configured: boolean }>('/onboarding/claude-oauth/status')
      .then((res) => {
        if (res.data.configured) {
          setPhase('success');
          onChange({ completed: true }, true);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => { api.post('/onboarding/claude-oauth/cancel').catch(() => {}); };
  }, []);

  const handleConnect = async () => {
    setPhase('loading_url');
    setErrorMsg('');
    setCode('');
    try {
      const res = await api.post<{ oauthUrl: string }>('/onboarding/claude-oauth/initiate');
      setOauthUrl(res.data.oauthUrl);
      window.open(res.data.oauthUrl, '_blank');
      setPhase('waiting_for_code');
    } catch (err) {
      setPhase('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to start connection');
    }
  };

  const handleExchangeCode = async () => {
    if (!code.trim()) return;
    setPhase('exchanging');
    setErrorMsg('');
    try {
      const res = await api.post<{ success: boolean; error?: string }>('/onboarding/claude-oauth/exchange-code', {
        code: code.trim(),
      });
      if (res.data.success) {
        setPhase('success');
        onChange({ completed: true }, true);
      } else {
        setPhase('error');
        setErrorMsg(res.data.error ?? 'Failed to exchange code.');
      }
    } catch (err) {
      setPhase('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to exchange code');
    }
  };

  const handlePasteToken = async () => {
    const token = pasteToken.trim();
    if (!token) return;
    try {
      await api.post('/onboarding/claude-oauth/set-token', { token });
      setPhase('success');
      setPasteToken('');
      onChange({ completed: true }, true);
    } catch {
      setPhase('error');
      setErrorMsg('Failed to save token.');
    }
  };

  const handleTestToken = async () => {
    setTestRunning(true);
    setTestOutput('');
    setTestError('');
    try {
      const jwt = localStorage.getItem('accessToken');
      const res = await fetch('/api/onboarding/claude-oauth/test-token', {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let gotResult = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') break;
          const parsed = JSON.parse(payload) as { type: string; text: string };
          if (parsed.type === 'delta') { gotResult = true; setTestOutput((prev) => prev + parsed.text); }
          else if (parsed.type === 'result' && !gotResult) setTestOutput(parsed.text);
          else if (parsed.type === 'error') setTestError(parsed.text);
        }
      }
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTestRunning(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 text-primary">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Bot className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-semibold">Connect Claude Account</h3>
          <p className="text-xs text-muted-foreground">
            Connect your Claude account to power the AI features.
          </p>
        </div>
      </div>

      {phase === 'idle' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Project X uses Claude as its AI engine. Connect your Anthropic account to activate
            document analysis, knowledge search, and chat capabilities.
          </p>
          <Button onClick={handleConnect} className="w-full gap-2" size="lg">
            <Bot className="h-4 w-4" />
            Connect Claude Account
          </Button>
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">or</span></div>
          </div>
          <Button onClick={() => setPhase('paste_token')} variant="outline" className="w-full gap-2" size="lg">
            Paste Token Directly
          </Button>
        </div>
      )}

      {phase === 'loading_url' && (
        <div className="flex flex-col items-center gap-3 py-4">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Starting connection...</p>
        </div>
      )}

      {phase === 'waiting_for_code' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              A browser tab has opened for Claude authorization. Complete the sign-in, then paste the full code you see (you can include the # part — we&apos;ll handle it).
            </p>
            {oauthUrl && (
              <a href={oauthUrl} target="_blank" rel="noopener noreferrer"
                className="mt-2 inline-block text-xs text-blue-600 underline hover:text-blue-800 dark:text-blue-400">
                Click here if the tab didn&apos;t open
              </a>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Authorization code</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleExchangeCode(); }}
                placeholder="Paste the code here..."
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
              />
              <Button onClick={handleExchangeCode} disabled={!code.trim()}>
                Submit
              </Button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              api.post('/onboarding/claude-oauth/cancel').catch(() => {});
              setPhase('idle');
              setCode('');
            }}
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            Cancel and go back
          </button>
        </div>
      )}

      {phase === 'exchanging' && (
        <div className="flex flex-col items-center gap-3 py-4">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Exchanging code for tokens...</p>
        </div>
      )}

      {phase === 'paste_token' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Run <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">claude setup-token</code> in
            your terminal and paste the token it gives you.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={pasteToken}
              onChange={(e) => setPasteToken(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handlePasteToken(); }}
              placeholder="sk-ant-oat01-..."
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
            <Button onClick={handlePasteToken} disabled={!pasteToken.trim()}>
              Save
            </Button>
          </div>
          <button type="button" onClick={() => { setPasteToken(''); setPhase('idle'); }}
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors">
            Back
          </button>
        </div>
      )}

      {phase === 'success' && (
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
            <Check className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-green-700 dark:text-green-400">
            Connected successfully!
          </p>
          <p className="text-xs text-muted-foreground">
            Your Claude account is linked. AI features are ready to use.
          </p>
          <Button variant="outline" size="sm" className="mt-2 gap-2" onClick={handleTestToken} disabled={testRunning}>
            {testRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
            {testRunning ? 'Testing...' : 'Test Token'}
          </Button>
          {(testOutput || testError) && (
            <div className={`mt-2 w-full rounded border p-3 text-xs ${
              testError
                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300'
                : 'border-border bg-muted/50 text-foreground'
            }`}>
              {testError ? <p>{testError}</p> : <p className="whitespace-pre-wrap">{testOutput}{testRunning ? '▌' : ''}</p>}
            </div>
          )}
        </div>
      )}

      {phase === 'error' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 text-red-600 dark:text-red-400 shrink-0" />
              <p className="text-sm text-red-800 dark:text-red-200">
                {errorMsg || 'Something went wrong. Please try again.'}
              </p>
            </div>
          </div>
          <Button onClick={() => { setPhase('idle'); setErrorMsg(''); setCode(''); }} variant="outline" className="w-full gap-2">
            Try Again
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step wrappers: delegate to shared components
// ---------------------------------------------------------------------------

function BusinessContextStep({ initialAnswer, onChange }: StepComponentProps) {
  return <BusinessContextFields initialAnswer={initialAnswer} onChange={onChange} />;
}

function UsageGoalsStep({ initialAnswer, onChange }: StepComponentProps) {
  return <UsageGoalsFields initialAnswer={initialAnswer} onChange={onChange} />;
}

// ---------------------------------------------------------------------------
// Step: Knowledge upload (batch upload + drag-to-reorder + activity feed)
// ---------------------------------------------------------------------------

interface UploadedFile {
  id: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  status: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Compact activity feed for processing — reuses the same websocket hook
const ACTIVITY_ICON: Record<AgentActivity['type'], React.ElementType> = {
  status: Activity,
  tool_call: Wrench,
  thinking: Lightbulb,
  text: MessageSquare,
  error: AlertCircle,
  complete: CheckCircle2,
};

const ACTIVITY_DOT: Record<AgentActivity['type'], string> = {
  status: 'bg-blue-500',
  tool_call: 'bg-amber-500',
  thinking: 'bg-primary',
  text: 'bg-foreground/40',
  error: 'bg-destructive',
  complete: 'bg-green-500',
};

function MiniActivityFeed({ documentIds }: { documentIds: string[] }) {
  const { events } = useKnowledgeActivity();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Filter events for only our documents
  const relevantEvents = events.filter((e) => documentIds.includes(e.documentId));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [relevantEvents.length]);

  if (relevantEvents.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Waiting for processing to start...
      </div>
    );
  }

  // Show last 20 events to keep it compact
  const recent = relevantEvents.slice(-20);

  return (
    <div className="accent-scrollbar flex max-h-64 flex-col gap-px overflow-y-auto rounded-lg border bg-card p-3">
      {recent.map((evt, i) => {
        const Icon = ACTIVITY_ICON[evt.type];
        const dot = ACTIVITY_DOT[evt.type];
        return (
          <div key={i} className="flex items-start gap-2 text-xs font-mono py-0.5">
            <span className="relative mt-[5px] flex shrink-0">
              <span className={`block h-1.5 w-1.5 rounded-full ${dot}`} />
            </span>
            <span className="min-w-0 flex-1 text-foreground/80 leading-relaxed">
              {evt.message}
            </span>
            <Icon className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/40" />
          </div>
        );
      })}
      {!relevantEvents.some((e) => e.type === 'complete' || e.type === 'error') && (
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span className="animate-pulse">Processing...</span>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

type UploadPhase = 'upload' | 'processing' | 'done';

function KnowledgeUploadStep({ initialAnswer, onChange, processing, onProcessingDone }: StepComponentProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('upload');
  const [processingDocIds, setProcessingDocIds] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragIdxRef = useRef<number | null>(null);

  // On mount: if we have saved documentIds (e.g. after refresh), fetch their info from the API
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    const savedIds = (initialAnswer.documentIds as string[]) ?? [];
    if (savedIds.length === 0) return;
    restoredRef.current = true;

    api.get<Array<{ id: string; title: string; filename: string; mimeType: string; fileSize: number; status: string }>>(
      '/knowledge/documents',
    ).then(({ data }) => {
      const savedSet = new Set(savedIds);
      const restored = data
        .filter((d) => savedSet.has(d.id))
        .map((d) => ({
          id: d.id,
          originalName: d.title || d.filename,
          mimeType: d.mimeType,
          fileSize: d.fileSize,
          status: d.status,
        }));
      // Preserve the order from savedIds
      const byId = new Map(restored.map((f) => [f.id, f]));
      const ordered = savedIds.map((id) => byId.get(id)).filter(Boolean) as UploadedFile[];
      setFiles(ordered);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When parent signals processing started, transition to processing phase
  useEffect(() => {
    if (processing && uploadPhase === 'upload' && files.length > 0) {
      const docIds = files.map((f) => f.id);
      setProcessingDocIds(docIds);
      setUploadPhase('processing');
    }
  }, [processing, uploadPhase, files]);

  // Poll document statuses during processing
  const [docStatuses, setDocStatuses] = useState<Record<string, string>>({});

  // Use activity events to detect completion instantly (no polling delay)
  const { events: activityEvents } = useKnowledgeActivity();

  useEffect(() => {
    if (uploadPhase !== 'processing' || processingDocIds.length === 0) return;

    // Check activity events for completion signals — update statuses instantly
    for (const evt of activityEvents) {
      if (
        processingDocIds.includes(evt.documentId) &&
        (evt.type === 'complete' || evt.type === 'error')
      ) {
        setDocStatuses((prev) => {
          if (prev[evt.documentId] === 'completed' || prev[evt.documentId] === 'failed') return prev;
          return { ...prev, [evt.documentId]: evt.type === 'complete' ? 'completed' : 'failed' };
        });
      }
    }
  }, [uploadPhase, processingDocIds, activityEvents]);

  useEffect(() => {
    if (uploadPhase !== 'processing' || processingDocIds.length === 0) return;

    const pollStatuses = async () => {
      try {
        const { data } = await api.get<Array<{ id: string; title: string; filename: string; status: string }>>(
          '/knowledge/documents',
        );
        const statusMap: Record<string, string> = {};
        for (const doc of data) {
          if (processingDocIds.includes(doc.id)) {
            statusMap[doc.id] = doc.status;
            // Update display name if the agent generated a title
            if (doc.title) {
              setFiles((prev) =>
                prev.map((f) => (f.id === doc.id && f.originalName !== doc.title ? { ...f, originalName: doc.title } : f)),
              );
            }
          }
        }
        setDocStatuses(statusMap);
      } catch {
        // ignore polling errors
      }
    };

    // Poll immediately, then every 3 seconds
    pollStatuses();
    const interval = setInterval(pollStatuses, 3000);
    return () => clearInterval(interval);
  }, [uploadPhase, processingDocIds]);

  // Detect when all documents are done (from either activity events or polling)
  useEffect(() => {
    if (uploadPhase !== 'processing' || processingDocIds.length === 0) return;
    const allDone = processingDocIds.every(
      (id) => docStatuses[id] === 'completed' || docStatuses[id] === 'failed',
    );
    if (allDone) {
      setUploadPhase('done');
      clearActivityForDocuments(processingDocIds);
      onProcessingDone?.();
    }
  }, [uploadPhase, processingDocIds, docStatuses, onProcessingDone]);

  // Notify parent of validity
  useEffect(() => {
    const documentIds = files.map((f) => f.id);
    onChange({ documentIds }, files.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const handleFiles = useCallback(async (fileList: FileList) => {
    setUploading(true);
    const newFiles: UploadedFile[] = [];
    for (const file of Array.from(fileList)) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const { data } = await api.post<UploadedFile>('/onboarding/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        newFiles.push({ ...data, originalName: data.originalName || file.name });
      } catch {
        toast.error(`Failed to upload ${file.name}`);
      }
    }
    setFiles((prev) => [...prev, ...newFiles]);
    setUploading(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedFiles = e.dataTransfer.files;
      if (droppedFiles.length > 0) handleFiles(droppedFiles);
    },
    [handleFiles],
  );

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  // Drag-to-reorder handlers
  const handleDragStart = (idx: number) => {
    dragIdxRef.current = idx;
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdxRef.current === null || dragIdxRef.current === idx) return;
    setFiles((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdxRef.current!, 1);
      next.splice(idx, 0, moved);
      dragIdxRef.current = idx;
      return next;
    });
  };

  const handleDragEnd = () => {
    dragIdxRef.current = null;
  };

  // Processing view
  if (uploadPhase === 'processing' || uploadPhase === 'done') {
    const completedCount = processingDocIds.filter(
      (id) => docStatuses[id] === 'completed',
    ).length;
    const failedCount = processingDocIds.filter(
      (id) => docStatuses[id] === 'failed',
    ).length;

    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3 text-primary">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold">
              {uploadPhase === 'done' ? 'Processing complete' : 'Processing your documents...'}
            </h3>
            <p className="text-xs text-muted-foreground">
              {uploadPhase === 'done'
                ? `${completedCount} of ${processingDocIds.length} documents processed successfully${failedCount > 0 ? `, ${failedCount} failed` : ''}`
                : 'The AI is analyzing and extracting knowledge from your files.'}
            </p>
          </div>
        </div>

        {/* Document progress list */}
        <div className="space-y-1.5">
          {files.map((file) => {
            const status = docStatuses[file.id] ?? 'pending';
            const isDone = status === 'completed';
            const isFailed = status === 'failed';
            return (
              <div
                key={file.id}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors duration-300 ${
                  isDone
                    ? 'border-primary/30 bg-primary/5'
                    : isFailed
                      ? 'border-destructive/30 bg-destructive/5'
                      : ''
                }`}
              >
                <FileText className={`h-4 w-4 shrink-0 ${isDone ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className="min-w-0 flex-1 truncate">{file.originalName}</span>
                {isDone ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                ) : isFailed ? (
                  <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                ) : (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                )}
              </div>
            );
          })}
        </div>

        {/* Activity feed */}
        <MiniActivityFeed documentIds={processingDocIds} />

        {uploadPhase === 'done' && (
          <p className="text-center text-xs text-muted-foreground">
            Documents are now in your knowledge base. You can manage them in the Knowledge page.
          </p>
        )}
      </div>
    );
  }

  // Upload + reorder view
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 text-primary">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <BookOpen className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-semibold">Teach Project X about your business</h3>
          <p className="text-xs text-muted-foreground">
            Upload your business documents so the AI can learn about your company.
          </p>
        </div>
      </div>

      {/* Drop zone */}
      <div
        className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 transition-colors hover:border-primary/40 hover:bg-muted/30"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {uploading ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Uploading...</p>
          </>
        ) : (
          <>
            <Upload className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Drag and drop files here, or
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
            >
              Browse Files
            </Button>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              multiple
              accept=".pdf,.txt,.md,.csv,.json,.xml,.html,.png,.jpg,.jpeg,.webp,.gif"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFiles(e.target.files);
                  e.target.value = '';
                }
              }}
            />
            <p className="text-[11px] text-muted-foreground/60">
              PDF, TXT, Markdown, CSV, JSON, XML, HTML, images
            </p>
          </>
        )}
      </div>

      {/* File list with drag-to-reorder */}
      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">
              {files.length} file{files.length !== 1 ? 's' : ''} uploaded
            </Label>
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground/70">
            Drag to reorder files as if you&apos;re teaching someone — put the most
            foundational documents first.
            <br />
            <span className="text-muted-foreground/50 italic">
              Example: Company Overview.pdf, Organization Structure.pdf, Products and Services.pdf...
            </span>
          </p>

          <div className="space-y-1">
            {files.map((file, idx) => (
              <div
                key={file.id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 transition-colors hover:bg-accent cursor-grab active:cursor-grabbing"
              >
                <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                <span className="text-xs font-mono text-muted-foreground/50 w-5 shrink-0">
                  {idx + 1}.
                </span>
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {file.originalName}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {formatFileSize(file.fileSize)}
                </span>
                <button
                  onClick={() => removeFile(file.id)}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {files.length === 0 && (
        <p className="text-center text-xs text-muted-foreground/60">
          You can skip this step and upload documents later from the Knowledge page.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step component registry
// ---------------------------------------------------------------------------

const STEP_COMPONENTS: Record<string, React.ComponentType<StepComponentProps>> = {
  theme_preference: ThemePreferenceStep,
  claude_signin: ClaudeConnectStep,
  business_context: BusinessContextStep,
  usage_goals: UsageGoalsStep,
  knowledge_upload: KnowledgeUploadStep,
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
  processingDocuments?: boolean;
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

  // Track knowledge processing state separately from step navigation
  const [knowledgeProcessing, setKnowledgeProcessing] = useState(false);
  const [knowledgeProcessingDone, setKnowledgeProcessingDone] = useState(false);

  const handleProcessingDone = useCallback(() => {
    setKnowledgeProcessingDone(true);
    // Auto-transition to the finishing phase after a brief pause
    setTimeout(() => {
      dispatch(fetchMe());
      dispatch(setOnboardingCompleted());
      setStepsExiting(true);
      setTimeout(() => setPhase('finishing'), 500);
    }, 1200);
  }, [dispatch]);

  // Fetch onboarding status and saved answers on mount
  useEffect(() => {
    Promise.all([
      api.get<OnboardingStatus>('/onboarding/status'),
      api.get<Record<string, Record<string, unknown>>>('/onboarding/answers'),
    ])
      .then(([statusRes, answersRes]) => {
        const data = statusRes.data;
        const savedAnswers = answersRes.data;
        setStatus(data);
        setAnswers(savedAnswers);

        // If all steps answered AND no documents still processing → done
        if (data.completed && !data.processingDocuments) {
          dispatch(setOnboardingCompleted());
          navigate('/app', { replace: true });
          return;
        }

        // If knowledge_upload was answered and documents are still processing,
        // resume directly on that step in processing mode
        const knowledgeStepIdx = data.steps.findIndex(
          (s) => s.id === 'knowledge_upload',
        );
        if (
          data.processingDocuments &&
          knowledgeStepIdx >= 0 &&
          data.steps[knowledgeStepIdx].completed
        ) {
          setCurrentIdx(knowledgeStepIdx);
          setKnowledgeProcessing(true);
          setPhase('steps');
          return;
        }

        // Otherwise go to first incomplete step
        const firstIncomplete = data.steps.findIndex((s) => !s.completed);
        if (firstIncomplete >= 0) {
          setCurrentIdx(firstIncomplete);
          // If user has completed at least one step before, skip intro
          if (firstIncomplete > 0) {
            setPhase('steps');
          }
        }
      })
      .catch(() => toast.error('Failed to load onboarding status'))
      .finally(() => setLoadingStatus(false));
  }, [dispatch, navigate]);

  const steps = status?.steps ?? [];
  const totalSteps = steps.length;
  const currentStep = steps[currentIdx];
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

    // For knowledge_upload step, handle the special flow
    if (currentStep.id === 'knowledge_upload') {
      const answer = answers[currentStep.id] ?? {};
      const documentIds = (answer.documentIds as string[]) ?? [];

      setSaving(true);
      try {
        // Only save document IDs — file metadata is fetched from the API on resume
        const result = await api.post<OnboardingStatus>(
          `/onboarding/steps/${currentStep.id}`,
          { answer: { documentIds } },
        );
        setStatus(result.data);

        if (documentIds.length > 0) {
          // Enter processing phase within the knowledge step
          setKnowledgeProcessing(true);
          // We don't navigate away — the step component shows processing UI
          // The "Finish" button will appear once processing is done
        } else {
          // No files uploaded — skip processing, finish onboarding
          finishOnboarding();
        }
      } catch {
        toast.error('Failed to save. Please try again.');
      } finally {
        setSaving(false);
      }
      return;
    }

    // Normal step flow
    setSaving(true);
    try {
      const result = await api.post<OnboardingStatus>(
        `/onboarding/steps/${currentStep.id}`,
        { answer: answers[currentStep.id] ?? {} },
      );
      setStatus(result.data);

      if (result.data.completed && !result.data.processingDocuments) {
        finishOnboarding();
      } else if (currentIdx < totalSteps - 1) {
        transitionToStep(currentIdx + 1);
      }
    } catch {
      toast.error('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const finishOnboarding = () => {
    dispatch(fetchMe());
    dispatch(setOnboardingCompleted());
    setStepsExiting(true);
    setTimeout(() => setPhase('finishing'), 500);
  };

  const handleBack = () => {
    if (currentIdx > 0) transitionToStep(currentIdx - 1);
  };

  const handleStartOnboarding = () => {
    setIntroExiting(true);
    setTimeout(() => setPhase('steps'), 500);
  };

  const isCurrentValid = currentStep ? validity[currentStep.id] === true : false;

  // For knowledge_upload: allow skipping (0 files), submitting with files, or finishing after done
  const isKnowledgeStep = currentStep?.id === 'knowledge_upload';
  const canProceed = isKnowledgeStep
    ? knowledgeProcessingDone || !knowledgeProcessing // Can proceed when not processing or when done
    : isCurrentValid;

  const StepComponent = currentStep ? STEP_COMPONENTS[currentStep.id] : null;
  const firstName = user?.name?.split(' ')[0] ?? '';

  if (loadingStatus) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // -- Finishing phase: confetti + explore button --
  if (phase === 'finishing') {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-background overflow-hidden">
        <Meta title="Welcome!" />
        <ConfettiCanvas />
        <div className="relative z-10 flex flex-col items-center gap-5 text-center">
          <FadeIn delay={100} duration={600}>
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary mx-auto ring-4 ring-primary/20">
              <Check className="h-10 w-10" strokeWidth={2.5} />
            </div>
          </FadeIn>
          <FadeIn delay={400} duration={600}>
            <h2 className="text-3xl font-bold tracking-tight">You&apos;re all set!</h2>
          </FadeIn>
          <FadeIn delay={650} duration={600}>
            <p className="text-muted-foreground max-w-sm">
              Your workspace is ready. Your documents have been processed and your AI assistant is standing by.
            </p>
          </FadeIn>
          <FadeIn delay={900} duration={600}>
            <Button
              size="lg"
              className="mt-4 gap-2 px-8 text-base"
              onClick={() => navigate('/app', { replace: true })}
            >
              Explore the Dashboard
              <ArrowRight className="h-4 w-4" />
            </Button>
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
  // Knowledge step answer info
  const knowledgeAnswer = answers['knowledge_upload'] ?? {};
  const knowledgeDocIds = (knowledgeAnswer.documentIds as string[]) ?? [];

  // Button label logic
  let nextButtonLabel: React.ReactNode;
  if (saving) {
    nextButtonLabel = <Loader2 className="h-3.5 w-3.5 animate-spin" />;
  } else if (isKnowledgeStep && knowledgeProcessingDone) {
    nextButtonLabel = (
      <>
        Finish
        <Check className="h-3.5 w-3.5" />
      </>
    );
  } else if (isKnowledgeStep && knowledgeProcessing) {
    nextButtonLabel = (
      <>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Processing...
      </>
    );
  } else if (isKnowledgeStep && knowledgeDocIds.length === 0) {
    nextButtonLabel = (
      <>
        Skip
        <ArrowRight className="h-3.5 w-3.5" />
      </>
    );
  } else if (isKnowledgeStep && knowledgeDocIds.length > 0) {
    nextButtonLabel = (
      <>
        Start Processing
        <ArrowRight className="h-3.5 w-3.5" />
      </>
    );
  } else if (currentIdx === totalSteps - 1) {
    nextButtonLabel = (
      <>
        Finish
        <Check className="h-3.5 w-3.5" />
      </>
    );
  } else {
    nextButtonLabel = (
      <>
        Continue
        <ArrowRight className="h-3.5 w-3.5" />
      </>
    );
  }

  const handleNextOrFinish = () => {
    if (isKnowledgeStep && knowledgeProcessingDone) {
      // All documents processed — finish onboarding
      finishOnboarding();
    } else {
      handleNext();
    }
  };

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
        <div className={`w-full space-y-6 ${isKnowledgeStep ? 'max-w-2xl' : 'max-w-lg'}`}>
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
                    processing={isKnowledgeStep ? knowledgeProcessing : undefined}
                    onProcessingDone={isKnowledgeStep ? handleProcessingDone : undefined}
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
                disabled={currentIdx === 0 || knowledgeProcessing}
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
                onClick={handleNextOrFinish}
                disabled={!canProceed || saving || (isKnowledgeStep && knowledgeProcessing && !knowledgeProcessingDone)}
                className="gap-1.5"
              >
                {nextButtonLabel}
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
