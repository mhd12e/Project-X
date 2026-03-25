import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAppSelector } from '@/store';
import { useTheme } from '@/hooks/use-theme';
import { Meta } from '@/components/shared/meta';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Moon, Sun, Bot, Brain, FileText, Search, Activity,
  Zap, Users, Clock, Shield, Minus,
  ArrowRight, CheckCircle2, ChevronRight,
  BarChart3, Cpu, Globe,
  Megaphone, Calculator, PenTool,
  LineChart, Lock, Eye
} from 'lucide-react';

function SectionHeader({ label, title, subtitle }: {
  label: string; title: React.ReactNode; subtitle?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary">{label}</p>
      <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {subtitle && <p className="mt-3 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function ComparisonRow({ feature, traditional, projectX }: { feature: string; traditional: string; projectX: string }) {
  return (
    <div className="grid grid-cols-3 items-center gap-4 border-b border-border/50 py-3.5 text-sm last:border-0">
      <span className="font-medium">{feature}</span>
      <span className="flex items-center gap-2 text-muted-foreground">
        <Minus className="h-3.5 w-3.5 shrink-0 opacity-40" />
        {traditional}
      </span>
      <span className="flex items-center gap-2 font-medium text-primary">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        {projectX}
      </span>
    </div>
  );
}

export function HomePage(): React.ReactElement {
  const { accessToken } = useAppSelector((s) => s.auth);
  const { resolved: theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('marketing');
  const [email, setEmail] = useState('');

  // Logged-in users go straight to the dashboard
  if (accessToken) {
    return <Navigate to="/app" replace />;
  }

  const agents: Record<string, { title: string; items: string[]; icon: React.ElementType; desc: string }> = {
    marketing: {
      title: 'Marketing',
      icon: Megaphone,
      desc: 'Lead generation, campaign strategy, A/B testing, competitor analysis, ad spend optimization, and performance reporting — handled autonomously.',
      items: [
        'Automatic lead discovery and qualification',
        'Full campaign strategy generation',
        'Autonomous A/B testing across channels',
        'Real-time competitor positioning analysis',
        'SEO-optimized content at scale',
        'ML-driven ad spend management',
      ],
    },
    hr: {
      title: 'HR & Recruiting',
      icon: Users,
      desc: 'Resume screening, candidate assessment, offer generation, onboarding, and compliance — without human bottlenecks.',
      items: [
        'Bulk resume screening and ranking',
        'Initial candidate assessments',
        'Offer letter and contract drafting',
        'End-to-end onboarding workflows',
        'Employee sentiment monitoring',
        'Compliance documentation',
      ],
    },
    finance: {
      title: 'Finance',
      icon: Calculator,
      desc: 'Financial modeling, invoice processing, anomaly detection, budget management, and audit-ready reporting.',
      items: [
        'Financial model generation and forecasting',
        'Automated invoice reconciliation',
        'Anomaly and fraud pattern detection',
        'Audit-ready report generation',
        'Cross-department budget allocation',
        'KPI tracking and deviation alerts',
      ],
    },
    content: {
      title: 'Content',
      icon: PenTool,
      desc: 'Blog posts, case studies, social media, email campaigns — all maintaining your brand voice consistently.',
      items: [
        'Blog posts, whitepapers, and case studies',
        'Consistent brand voice across channels',
        'Multi-platform content repurposing',
        'Engagement-optimized content updates',
        'Social media calendar and post creation',
        'Visual content briefs and specifications',
      ],
    },
    analytics: {
      title: 'Analytics',
      icon: LineChart,
      desc: 'Natural language dashboards, trend identification, cross-system correlation, and executive summaries.',
      items: [
        'Natural language dashboard creation',
        'Hidden trend identification',
        'Cross-system data correlation',
        'Instant actionable recommendations',
        'Real-time business metric monitoring',
        'Automated executive summaries',
      ],
    },
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Meta
        title="AI-Powered Business Operations Platform"
        description="Autonomous agents that find leads, run marketing, handle HR, manage finances, and analyze data. Self-hosted AI operations platform for modern businesses."
      />

      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Bot className="h-4 w-4" />
            </div>
            <span className="text-base font-bold tracking-tight">Project X</span>
            <Badge variant="outline" className="ml-1 border-primary/30 text-primary text-[9px] font-semibold uppercase tracking-widest">Beta</Badge>
          </div>
          <nav className="hidden items-center gap-7 md:flex">
            {[
              { href: '#agents', label: 'Agents' },
              { href: '#how-it-works', label: 'How It Works' },
              { href: '#comparison', label: 'Comparison' },
              { href: '#platform', label: 'Platform' },
            ].map(({ href, label }) => (
              <a key={href} href={href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">{label}</a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button size="sm" className="h-8 text-xs">
              Join Waitlist <ArrowRight className="ml-1.5 h-3 w-3" />
            </Button>
          </div>
        </div>
      </header>

      <section className="relative flex min-h-[calc(100vh-3.5rem)] flex-col justify-between border-b">
        <div className="flex flex-1 items-center">
          <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 py-16 lg:grid-cols-2 lg:gap-16">
            <div className="flex flex-col justify-center">
              <Badge variant="secondary" className="mb-5 w-fit text-[10px] font-semibold uppercase tracking-widest">
                Coming Soon — Private Beta
              </Badge>
              <h1 className="animate-fade-up opacity-0 delay-100 text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
                AI agents that run<br />your business ops.
              </h1>
              <p className="mt-5 max-w-md animate-fade-up opacity-0 delay-200 text-sm leading-relaxed text-muted-foreground">
                Autonomous agents that find leads, run marketing, handle HR, manage finances, and analyze data. They process knowledge, generate insights, and execute workflows — so your team focuses on strategy.
              </p>
              <div className="mt-7 flex animate-fade-up opacity-0 delay-300 items-center gap-2">
                <Input type="email" placeholder="Enter your work email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-10 max-w-[260px] text-sm" />
                <Button className="h-10 px-5 text-sm font-medium">Join Waitlist</Button>
              </div>
              <p className="mt-2 animate-fade-up opacity-0 delay-400 text-[11px] text-muted-foreground">
                Early access for qualifying teams. No credit card required.
              </p>
            </div>
            <div className="animate-fade-up opacity-0 delay-400 flex flex-col gap-3">
              <Card>
                <CardContent className="p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Platform Architecture</p>
                  <div className="space-y-2">
                    {[
                      { icon: Brain, name: 'Agent Runtime', desc: 'Manages agent sessions, conversations, and task execution' },
                      { icon: FileText, name: 'Knowledge Layer', desc: 'Structured business information and document storage' },
                      { icon: Search, name: 'Retrieval System', desc: 'Intelligent search across knowledge sources' },
                      { icon: Cpu, name: 'Resource Registry', desc: 'Tracks files, datasets, and generated outputs' },
                      { icon: Zap, name: 'Tool System', desc: 'Modular capabilities agents use to perform tasks' },
                    ].map(({ icon: Icon, name, desc }) => (
                      <div key={name} className="flex items-start gap-3 rounded-lg border p-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div>
                        <div>
                          <p className="text-xs font-semibold">{name}</p>
                          <p className="text-[10px] leading-relaxed text-muted-foreground">{desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'AI Provider', value: 'Anthropic' },
                  { label: 'Vector Search', value: 'Qdrant' },
                  { label: 'Self-Hosted', value: 'Docker' },
                ].map(({ label, value }) => (
                  <Card key={label}><CardContent className="p-3 text-center"><p className="text-sm font-bold">{value}</p><p className="text-[10px] text-muted-foreground">{label}</p></CardContent></Card>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="relative border-t">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
            {[
              { icon: Megaphone, label: 'Marketing' },
              { icon: Users, label: 'HR & Recruiting' },
              { icon: Calculator, label: 'Finance' },
              { icon: PenTool, label: 'Content' },
              { icon: LineChart, label: 'Analytics' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-center">
                <Icon className="h-4 w-4 text-primary/60" />
                <span className="text-xs font-medium text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="agents" className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <SectionHeader label="Autonomous Agents" title="Five agents. Five departments covered." subtitle="Each agent operates autonomously within its domain — analyzing, deciding, and executing without human intervention." />
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-12">
            <TabsList className="mx-auto flex h-auto w-full max-w-xl flex-wrap justify-center gap-1 bg-transparent p-0">
              {Object.entries(agents).map(([key, { title, icon: Icon }]) => (
                <TabsTrigger key={key} value={key} className="rounded-full px-4 py-2 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Icon className="mr-1.5 h-3.5 w-3.5" /> {title}
                </TabsTrigger>
              ))}
            </TabsList>
            {Object.entries(agents).map(([key, { title, items, icon: Icon, desc }]) => (
              <TabsContent key={key} value={key} className="mt-8">
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
                      <div><CardTitle className="text-base">{title} Agent</CardTitle><p className="mt-0.5 text-xs text-muted-foreground">{desc}</p></div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {items.map((item, i) => (
                        <div key={i} className="flex items-start gap-2.5 rounded-md px-2 py-1.5 text-sm">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/60" />
                          <span className="text-muted-foreground">{item}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </section>

      <section id="how-it-works" className="border-y bg-muted/30 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <SectionHeader label="How It Works" title="Three steps to get started." />
          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {[
              { step: '01', title: 'Connect Your Data', icon: Globe, desc: 'Plug in your existing tools, databases, and documents. The platform ingests and indexes everything.', details: ['CRM, ERP, analytics tools', 'Documents, spreadsheets, PDFs', 'APIs and databases'] },
              { step: '02', title: 'Deploy Agents', icon: Cpu, desc: 'Choose which departments to automate. Agents configure themselves based on your business context.', details: ['Marketing, HR, Finance, Content', 'Custom agent workflows', 'Role-based permissions'] },
              { step: '03', title: 'Monitor & Iterate', icon: Activity, desc: 'Full visibility into every agent decision. Review, adjust, and scale as you build confidence.', details: ['Real-time activity dashboard', 'Full audit trail', 'Transparent decision logs'] },
            ].map(({ step, title, desc, icon: Icon, details }) => (
              <Card key={step} className="group relative transition-all duration-200 hover:border-primary/30 hover:shadow-md">
                <span className="absolute right-5 top-5 text-4xl font-bold text-muted-foreground/10">{step}</span>
                <CardHeader className="relative">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Icon className="h-5 w-5" /></div>
                  <CardTitle className="mt-3 text-base">{title}</CardTitle>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {details.map((d, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground"><ChevronRight className="h-3 w-3 text-primary/50" />{d}</div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="comparison" className="py-20">
        <div className="mx-auto max-w-5xl px-6">
          <SectionHeader label="Why AI Agents" title="What changes when operations are autonomous." subtitle="A comparison of traditional team-based operations vs. agent-driven workflows." />
          <Card className="mt-12">
            <CardContent className="p-6 sm:p-8">
              <div className="mb-4 grid grid-cols-3 gap-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Capability</span><span>Traditional Approach</span><span className="text-primary">With Project X</span>
              </div>
              <Separator className="mb-1" />
              <ComparisonRow feature="Campaign Execution" traditional="Weeks of planning" projectX="Minutes to deploy" />
              <ComparisonRow feature="Resume Screening" traditional="Days per batch" projectX="Seconds per batch" />
              <ComparisonRow feature="Report Generation" traditional="Manual, periodic" projectX="Automated, real-time" />
              <ComparisonRow feature="Content Production" traditional="Limited by headcount" projectX="Scales on demand" />
              <ComparisonRow feature="Data Analysis" traditional="Request and wait" projectX="Ask and receive" />
              <ComparisonRow feature="Error Rate" traditional="Varies by individual" projectX="Consistent and auditable" />
              <ComparisonRow feature="Availability" traditional="Business hours" projectX="24/7/365" />
              <ComparisonRow feature="Scaling" traditional="Hire and train" projectX="Deploy and configure" />
            </CardContent>
          </Card>
        </div>
      </section>

      <section id="platform" className="border-y bg-muted/30 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <SectionHeader label="Platform" title="Built for transparency, security, and control." subtitle="Every agent action is observable. Every decision is auditable. You stay in control." />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Eye, title: 'Full Transparency', desc: 'Watch every agent decision in real-time. Full audit trail for every action taken.' },
              { icon: Lock, title: 'Security First', desc: 'JWT + RBAC on all endpoints. Input sanitization, rate limiting, and strict CORS.' },
              { icon: Brain, title: 'Knowledge Engine', desc: 'Ingest documents, PDFs, and data. Agents build context from your business knowledge.' },
              { icon: Search, title: 'Semantic Search', desc: 'Vector-powered retrieval across all knowledge sources using Qdrant.' },
              { icon: Zap, title: 'Tool System', desc: 'Modular capabilities that agents compose to handle complex multi-step tasks.' },
              { icon: Shield, title: 'Self-Hosted', desc: 'Runs entirely in your infrastructure via Docker Compose. Your data never leaves.' },
              { icon: BarChart3, title: 'Observable', desc: 'Every tool call, retrieval operation, and workflow step is visible in the UI.' },
              { icon: Clock, title: 'Always Running', desc: 'Agents work continuously on background tasks, monitoring, and scheduled operations.' },
            ].map(({ icon: Icon, title, desc }) => (
              <Card key={title} className="border-transparent bg-background transition-all duration-200 hover:border-primary/20 hover:shadow-sm">
                <CardContent className="p-5"><Icon className="mb-2.5 h-4 w-4 text-primary" /><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p></CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12">
        <div className="mx-auto max-w-3xl px-6">
          <Card>
            <CardContent className="p-6">
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-50" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" /></span>
                  <span className="text-sm font-semibold">Development Status</span>
                </div>
                <Badge variant="secondary" className="text-[10px] font-semibold uppercase tracking-widest">Private Beta</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {['Agent Runtime', 'Knowledge Layer', 'Vector Search', 'Task Queue', 'Real-time Events', 'Auth & RBAC'].map((name) => (
                  <div key={name} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-xs">
                    <span className="text-muted-foreground">{name}</span><span className="text-[10px] text-primary">In Development</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="border-t py-24">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Be first in line.</h2>
          <p className="mx-auto mt-4 max-w-lg text-sm text-muted-foreground">
            Project X is currently in private beta. Join the waitlist to get early access when we launch. We&apos;re building this with transparency — you&apos;ll see exactly how every agent thinks and acts.
          </p>
          <div className="mx-auto mt-8 flex max-w-sm items-center gap-2">
            <Input type="email" placeholder="your@company.com" className="h-10 text-sm" />
            <Button className="h-10 shrink-0 px-5 text-sm font-medium">Join Waitlist</Button>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">No spam. We&apos;ll only email you when we&apos;re ready.</p>
        </div>
      </section>

      <footer className="border-t py-8">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground"><Bot className="h-3.5 w-3.5" /></div>
              <span className="text-sm font-bold">Project X</span>
              <Badge variant="outline" className="border-primary/30 text-primary text-[8px] font-semibold uppercase tracking-widest">Beta</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">&copy; 2026 Project X. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
