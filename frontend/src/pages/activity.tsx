import { useEffect, useCallback } from 'react';
import { Meta } from '@/components/shared/meta';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_LABELS } from '@/lib/activity-config';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  fetchActivityLogs,
  fetchActivityStats,
  fetchActivityTimeline,
  fetchActivityCategories,
  setFilters,
  setTimelineRange,
  type ActivityCategory as ACat,
  type ActivityLevel,
} from '@/store/activity.slice';
import { useActivityStream } from '@/hooks/use-activity-stream';

const LEVEL_STYLES: Record<string, string> = {
  info: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  warn: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  error: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatTimelineLabel(timestamp: string): string {
  // "2026-03-12 14:00:00" → "14:00" or "Mar 12"
  if (timestamp.includes(' ')) {
    const time = timestamp.split(' ')[1];
    return time.slice(0, 5);
  }
  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ActivityPage() {
  const dispatch = useAppDispatch();
  const { logs, total, stats, timeline, categories, loading, statsLoading, chartsLoading, filters, timelineRange } =
    useAppSelector((s) => s.activity);

  const refreshing = loading || statsLoading || chartsLoading;

  useActivityStream();

  const loadData = useCallback(() => {
    dispatch(fetchActivityLogs({ category: filters.category || undefined, level: filters.level || undefined, page: filters.page }));
    dispatch(fetchActivityStats());
    dispatch(fetchActivityTimeline(timelineRange));
    dispatch(fetchActivityCategories(timelineRange));
  }, [dispatch, filters, timelineRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCategoryFilter = (value: string) => {
    dispatch(setFilters({ category: value === 'all' ? '' : value as ACat, page: 1 }));
  };

  const handleLevelFilter = (value: string) => {
    dispatch(setFilters({ level: value === 'all' ? '' : value as ActivityLevel, page: 1 }));
  };

  const handleRangeChange = (value: string) => {
    dispatch(setTimelineRange(value as 'day' | 'week' | 'month'));
  };

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <Meta title="Activity" />
      <PageHeader
        title="System Activity"
        subtitle="Real-time log of all platform actions, agent operations, and system events."
        actions={
          <Button variant="outline" size="sm" onClick={loadData} disabled={refreshing}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Today"
          value={stats?.totalToday ?? 0}
          icon={Clock}
          loading={statsLoading}
        />
        <StatCard
          title="This Week"
          value={stats?.totalThisWeek ?? 0}
          icon={BarChart3}
          loading={statsLoading}
        />
        <StatCard
          title="Errors (7d)"
          value={stats?.errorCount ?? 0}
          icon={AlertTriangle}
          loading={statsLoading}
          variant={stats?.errorCount ? 'destructive' : 'default'}
        />
        <StatCard
          title="Categories Active"
          value={Object.keys(stats?.byCategory ?? {}).length}
          icon={Activity}
          loading={statsLoading}
        />
      </div>

      {/* Charts */}
      <Tabs defaultValue="timeline">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
          </TabsList>
          <Select value={timelineRange} onValueChange={handleRangeChange}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">24 Hours</SelectItem>
              <SelectItem value="week">7 Days</SelectItem>
              <SelectItem value="month">30 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <TabsContent value="timeline" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Activity Over Time
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              {chartsLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/60 backdrop-blur-[1px] rounded-lg">
                  <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {timeline.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={timeline}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={formatTimelineLabel}
                      className="text-[10px] fill-muted-foreground"
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis
                      allowDecimals={false}
                      className="text-[10px] fill-muted-foreground"
                      tick={{ fontSize: 10 }}
                    />
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
                            <p style={{ margin: 0, fontWeight: 500 }}>
                              {String(label)}
                            </p>
                            <p style={{ margin: '4px 0 0', color: 'hsl(var(--primary))' }}>
                              Events: {Number(payload[0].value).toLocaleString()}
                            </p>
                          </div>
                        );
                      }}
                      cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="hsl(var(--primary))"
                      fillOpacity={1}
                      fill="url(#colorCount)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
                  No timeline data yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Activity by Category
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              {chartsLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/60 backdrop-blur-[1px] rounded-lg">
                  <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {categories.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={categories} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                    <YAxis
                      dataKey="category"
                      type="category"
                      width={90}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(val: string) => CATEGORY_LABELS[val] ?? val}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const entry = payload[0];
                        const cat = String(entry.payload?.category ?? '');
                        const color = CATEGORY_COLORS[cat] ?? '#94a3b8';
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
                            <p style={{ margin: 0, fontWeight: 500 }}>
                              {CATEGORY_LABELS[cat] ?? cat}
                            </p>
                            <p style={{ margin: '4px 0 0', color }}>
                              Events: {Number(entry.value).toLocaleString()}
                            </p>
                          </div>
                        );
                      }}
                      cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {categories.map((entry) => (
                        <Cell
                          key={entry.category}
                          fill={CATEGORY_COLORS[entry.category] ?? '#94a3b8'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
                  No category data yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Activity Log Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              Activity Log
              {total > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({total} total)
                </span>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select
                value={filters.category || 'all'}
                onValueChange={handleCategoryFilter}
              >
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="auth">Auth</SelectItem>
                  <SelectItem value="knowledge">Knowledge</SelectItem>
                  <SelectItem value="chat">Chat</SelectItem>
                  <SelectItem value="retrieval">Retrieval</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filters.level || 'all'}
                onValueChange={handleLevelFilter}
              >
                <SelectTrigger className="h-8 w-28 text-xs">
                  <SelectValue placeholder="Level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warn">Warning</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={Activity}
                title="No activity yet"
                description="Platform actions will appear here as they happen."
              />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Time</TableHead>
                    <TableHead className="w-[100px]">Category</TableHead>
                    <TableHead className="w-[70px]">Level</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-[140px]">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const CatIcon = CATEGORY_ICONS[log.category] ?? Activity;
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          <div>{formatTime(log.createdAt)}</div>
                          <div className="text-[10px]">{formatDate(log.createdAt)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <CatIcon
                              className="h-3.5 w-3.5"
                              style={{ color: CATEGORY_COLORS[log.category] }}
                            />
                            <span className="text-xs">{CATEGORY_LABELS[log.category] ?? log.category}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={`text-[10px] ${LEVEL_STYLES[log.level] ?? ''}`}
                          >
                            {log.level.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[400px] truncate text-xs">
                          {log.description}
                        </TableCell>
                        <TableCell>
                          <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
                            {log.action}
                          </code>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t px-4 py-3">
                  <span className="text-xs text-muted-foreground">
                    Page {filters.page} of {totalPages}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={filters.page <= 1}
                      onClick={() => dispatch(setFilters({ page: filters.page - 1 }))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={filters.page >= totalPages}
                      onClick={() => dispatch(setFilters({ page: filters.page + 1 }))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  loading,
  variant = 'default',
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  loading: boolean;
  variant?: 'default' | 'destructive';
}) {
  return (
    <Card>
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
        <div>
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
}
