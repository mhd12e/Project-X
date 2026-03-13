import { FileText } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';

export function DocumentsPage() {
  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeader
        title="Documents"
        subtitle="Upload and manage files for agent processing."
        actions={<Button size="sm" disabled>Upload Document</Button>}
      />
      <EmptyState
        icon={FileText}
        title="No documents"
        description="Upload PDFs, spreadsheets, and other files. Agents will analyze and extract knowledge from them."
      />
    </div>
  );
}
