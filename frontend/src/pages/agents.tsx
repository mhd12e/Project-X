import { Bot } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';

export function AgentsPage() {
  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeader
        title="Agents"
        subtitle="Manage autonomous agent sessions and conversations."
        actions={<Button size="sm" disabled>New Agent Session</Button>}
      />
      <EmptyState
        icon={Bot}
        title="No agents yet"
        description="Agent sessions will appear here once the agent runtime is built. Each agent operates autonomously within its domain."
      />
    </div>
  );
}
