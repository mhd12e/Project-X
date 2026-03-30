import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Brain,
  MessageSquare,
  Activity,
  AlertTriangle,
  FileText,
  Plus,
  Upload,
  ArrowRight,
  Clock,
  CheckCircle2,
  Cog,
  RefreshCw,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppSelector } from '@/store';
import { Meta } from '@/components/shared/meta';
import { formatRelativeDate } from '@/lib/utils';
import { CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_LABELS } from '@/lib/activity-config';
import api from '@/lib/api';
import type { ActivityStats, TimelinePoint, ActivityLogEntry } from '@/store/activity.slice';
import type { KnowledgeDocument } from '@/store/knowledge.slice';
import type { Conversation } from '@/store/conversation.slice';

// ---- Helpers ----

function greetingText(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const formatRelative = formatRelativeDate;

function formatTimelineLabel(timestamp: string): string {
  if (timestamp.includes(' ')) {
    const time = timestamp.split(' ')[1];
    return time.slice(0, 5);
  }
  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const STATUS_ICONS: Record<string, React.ElementType> = {
  pending: Clock,
  processing: Cog,
  completed: CheckCircle2,
  failed: AlertTriangle,
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'text-muted-foreground',
  processing: 'text-blue-500',
  completed: 'text-green-500',
  failed: 'text-destructive',
};

// ---- Dashboard State ----

interface DashboardData {
  stats: ActivityStats | null;
  timeline: TimelinePoint[];
  recentActivity: ActivityLogEntry[];
  documents: KnowledgeDocument[];
  conversations: Conversation[];
}

function useDashboardData() {
  const [data, setData] = useState<DashboardData>({
    stats: null,
    timeline: [],
    recentActivity: [],
    documents: [],
    conversations: [],
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, timelineRes, activityRes, docsRes, convsRes] = await Promise.all([
        api.get<ActivityStats>('/activity/stats'),
        api.get<TimelinePoint[]>('/activity/timeline?range=week'),
        api.get<{ data: ActivityLogEntry[]; total: number }>('/activity?limit=5'),
        api.get<KnowledgeDocument[]>('/knowledge/documents'),
        api.get<Conversation[]>('/conversations?type=chat'),
      ]);
      setData({
        stats: statsRes.data,
        timeline: timelineRes.data,
        recentActivity: activityRes.data.data,
        documents: docsRes.data,
        conversations: convsRes.data,
      });
    } catch {
      // Silently handle — partial data is fine
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { data, loading, refresh: load };
}

// ---- Components ----

function StatCard({
  title,
  value,
  icon: Icon,
  loading,
  variant = 'default',
  href,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  loading: boolean;
  variant?: 'default' | 'destructive';
  href?: string;
}) {
  const content = (
    <Card className={href ? 'transition-colors hover:border-primary/30' : ''}>
      <CardContent className="flex items-center gap-4 p-4">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
            variant === 'destructive'
              ? 'bg-red-500/10 text-red-600 dark:text-red-400'
              : 'bg-primary/10 text-primary'
          }`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{title}</p>
          {loading ? (
            <Skeleton className="mt-1 h-6 w-12" />
          ) : (
            <p className="text-xl font-semibold tabular-nums">{value.toLocaleString()}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link to={href}>{content}</Link>;
  }
  return content;
}

function QuickAction({
  icon: Icon,
  label,
  description,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-all hover:border-primary/30 hover:shadow-sm"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

function ActivityTimeline({
  timeline,
  loading,
}: {
  timeline: TimelinePoint[];
  loading: boolean;
}) {
  return (
    <Card className="col-span-full lg:col-span-2">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Activity — Last 7 Days</CardTitle>
          <Link to="/app/activity">
            <Button variant="ghost" size="sm" className="h-7 text-xs">
              View all
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[200px] w-full" />
        ) : timeline.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={timeline}>
              <defs>
                <linearGradient id="dashGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="timestamp"
                tickFormatter={formatTimelineLabel}
                tick={{ fontSize: 10 }}
                className="fill-muted-foreground"
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div
                      style={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                        fontSize: '12px',
                        padding: '8px 12px',
                      }}
                    >
                      <p style={{ margin: 0, fontWeight: 500 }}>{String(label)}</p>
                      <p style={{ margin: '4px 0 0', color: 'hsl(var(--primary))' }}>
                        Events: {Number(payload[0].value).toLocaleString()}
                      </p>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="hsl(var(--primary))"
                fillOpacity={1}
                fill="url(#dashGrad)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
            No activity data yet
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentActivityList({
  entries,
  loading,
}: {
  entries: ActivityLogEntry[];
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
          <Link to="/app/activity">
            <Button variant="ghost" size="sm" className="h-7 text-xs">
              View all
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No activity yet
          </p>
        ) : (
          <div className="space-y-1">
            {entries.map((entry) => {
              const CatIcon = CATEGORY_ICONS[entry.category] ?? Activity;
              return (
                <div key={entry.id} className="flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/50">
                  <div
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                    style={{ backgroundColor: `${CATEGORY_COLORS[entry.category] ?? '#64748b'}15` }}
                  >
                    <CatIcon
                      className="h-3.5 w-3.5"
                      style={{ color: CATEGORY_COLORS[entry.category] }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs">{entry.description}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {CATEGORY_LABELS[entry.category] ?? entry.category} · {formatRelative(entry.createdAt)}
                    </p>
                  </div>
                  {entry.level === 'error' && (
                    <Badge variant="destructive" className="shrink-0 text-[9px] px-1.5 py-0">
                      ERR
                    </Badge>
                  )}
                  {entry.level === 'warn' && (
                    <Badge variant="secondary" className="shrink-0 text-[9px] px-1.5 py-0 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      WARN
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentConversations({
  conversations,
  loading,
}: {
  conversations: Conversation[];
  loading: boolean;
}) {
  const recent = conversations.slice(0, 5);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Recent Conversations</CardTitle>
          <Link to="/app/chat">
            <Button variant="ghost" size="sm" className="h-7 text-xs">
              View all
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6">
            <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No conversations yet</p>
            <Link to="/app/chat">
              <Button variant="outline" size="sm" className="mt-1">
                <Plus className="mr-1.5 h-3 w-3" />
                Start a chat
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-1">
            {recent.map((conv) => (
              <Link
                key={conv.id}
                to={`/app/content/${conv.id}`}
                state={{ type: 'chat' }}
                className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/50"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-500/10">
                  <MessageSquare className="h-3.5 w-3.5 text-blue-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">
                    {conv.title || 'Untitled conversation'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatRelative(conv.updatedAt)}
                  </p>
                </div>
                <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/40" />
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function KnowledgeOverview({
  documents,
  loading,
}: {
  documents: KnowledgeDocument[];
  loading: boolean;
}) {
  const completed = documents.filter((d) => d.status === 'completed').length;
  const processing = documents.filter((d) => d.status === 'processing' || d.status === 'pending').length;
  const failed = documents.filter((d) => d.status === 'failed').length;
  const recent = documents.slice(0, 4);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Knowledge Base</CardTitle>
          <Link to="/app/knowledge">
            <Button variant="ghost" size="sm" className="h-7 text-xs">
              Manage
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6">
            <Brain className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No documents uploaded</p>
            <Link to="/app/knowledge">
              <Button variant="outline" size="sm" className="mt-1">
                <Upload className="mr-1.5 h-3 w-3" />
                Upload document
              </Button>
            </Link>
          </div>
        ) : (
          <>
            {/* Status summary */}
            <div className="mb-3 flex items-center gap-3">
              {completed > 0 && (
                <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>{completed} ready</span>
                </div>
              )}
              {processing > 0 && (
                <div className="flex items-center gap-1 text-xs text-blue-500">
                  <Cog className="h-3 w-3 animate-spin" />
                  <span>{processing} processing</span>
                </div>
              )}
              {failed > 0 && (
                <div className="flex items-center gap-1 text-xs text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  <span>{failed} failed</span>
                </div>
              )}
            </div>

            {/* Recent documents */}
            <div className="space-y-1">
              {recent.map((doc) => {
                const StatusIcon = STATUS_ICONS[doc.status] ?? FileText;
                const statusColor = STATUS_COLORS[doc.status] ?? '';
                return (
                  <Link
                    key={doc.id}
                    to={`/app/knowledge/${doc.id}`}
                    className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
                      <FileText className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">
                        {doc.title || 'Untitled'}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatRelative(doc.createdAt)}
                      </p>
                    </div>
                    <StatusIcon className={`h-3.5 w-3.5 shrink-0 ${statusColor}`} />
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Main Page ----

export function DashboardPage() {
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user);
  const { data, loading, refresh } = useDashboardData();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="flex flex-1 flex-col gap-6">
      <Meta title="Dashboard" />
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {greetingText()}, {user?.name?.split(' ')[0] ?? 'there'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{today}</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Documents"
          value={data.documents.length}
          icon={Brain}
          loading={loading}
          href="/app/knowledge"
        />
        <StatCard
          title="Conversations"
          value={data.conversations.length}
          icon={MessageSquare}
          loading={loading}
          href="/app/chat"
        />
        <StatCard
          title="Activity Today"
          value={data.stats?.totalToday ?? 0}
          icon={Activity}
          loading={loading}
          href="/app/activity"
        />
        <StatCard
          title="Errors (7d)"
          value={data.stats?.errorCount ?? 0}
          icon={AlertTriangle}
          loading={loading}
          variant={data.stats?.errorCount ? 'destructive' : 'default'}
          href="/app/activity"
        />
      </div>

      {/* Quick Actions */}
      <div className="grid gap-3 sm:grid-cols-3">
        <QuickAction
          icon={Plus}
          label="New Chat"
          description="Start a conversation with the AI agent"
          onClick={() => navigate('/app/chat')}
        />
        <QuickAction
          icon={Upload}
          label="Upload Document"
          description="Add to the knowledge base"
          onClick={() => navigate('/app/knowledge')}
        />
        <QuickAction
          icon={Activity}
          label="View Activity"
          description="Monitor system events and logs"
          onClick={() => navigate('/app/activity')}
        />
      </div>

      {/* Charts + Activity */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ActivityTimeline timeline={data.timeline} loading={loading} />
        <RecentActivityList entries={data.recentActivity} loading={loading} />
      </div>

      {/* Bottom row */}
      <div className="grid gap-4 md:grid-cols-2">
        <RecentConversations conversations={data.conversations} loading={loading} />
        <KnowledgeOverview documents={data.documents} loading={loading} />
      </div>
    </div>
  );
}
