import { useEffect, useCallback, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Markdown } from '@/components/shared/markdown';
import {
  Brain,
  Upload,
  FileText,
  Trash2,
  ChevronRight,
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Cog,
  Wrench,
  MessageSquare,
  Lightbulb,
  Activity,
} from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  fetchDocuments,
  fetchDocument,
  uploadDocument,
  deleteDocument,
  clearSelectedDocument,
  type KnowledgeDocument,
} from '@/store/knowledge.slice';
import {
  useKnowledgeActivity,
  type AgentActivity,
} from '@/hooks/use-knowledge-activity';

const STATUS_CONFIG: Record<
  KnowledgeDocument['status'],
  { label: string; icon: React.ElementType; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  pending: { label: 'Pending', icon: Clock, variant: 'outline' },
  processing: { label: 'Processing', icon: Cog, variant: 'secondary' },
  completed: { label: 'Completed', icon: CheckCircle2, variant: 'default' },
  failed: { label: 'Failed', icon: AlertCircle, variant: 'destructive' },
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ status }: { status: KnowledgeDocument['status'] }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

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
  thinking: 'bg-purple-500',
  text: 'bg-foreground/40',
  error: 'bg-destructive',
  complete: 'bg-green-500',
};

const ACTIVITY_COLOR: Record<AgentActivity['type'], string> = {
  status: 'text-blue-600 dark:text-blue-400',
  tool_call: 'text-amber-600 dark:text-amber-400',
  thinking: 'text-purple-600 dark:text-purple-400',
  text: 'text-muted-foreground',
  error: 'text-destructive',
  complete: 'text-green-600 dark:text-green-400',
};

const ACTIVITY_LABEL: Record<AgentActivity['type'], string> = {
  status: 'STATUS',
  tool_call: 'TOOL',
  thinking: 'THINK',
  text: 'TEXT',
  error: 'ERROR',
  complete: 'DONE',
};

interface TreeNode {
  event: AgentActivity;
  children: TreeNode[];
}

function buildTree(events: AgentActivity[]): TreeNode[] {
  const roots: TreeNode[] = [];
  let currentParent: TreeNode | null = null;

  for (const evt of events) {
    const node: TreeNode = { event: evt, children: [] };

    if (evt.type === 'status') {
      // Status events are top-level nodes
      roots.push(node);
      currentParent = node;
    } else if (currentParent) {
      // Everything else nests under the last status
      currentParent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function TreeLine({
  event,
  isLast,
  depth,
}: {
  event: AgentActivity;
  isLast: boolean;
  depth: number;
}) {
  const Icon = ACTIVITY_ICON[event.type];
  const dot = ACTIVITY_DOT[event.type];
  const color = ACTIVITY_COLOR[event.type];
  const label = ACTIVITY_LABEL[event.type];

  return (
    <div className="flex items-start gap-0 text-xs font-mono">
      {/* tree guides */}
      {depth > 0 && (
        <span className="inline-flex w-5 shrink-0 select-none items-start justify-center text-muted-foreground/30">
          {isLast ? '└' : '├'}
        </span>
      )}

      {/* dot */}
      <span className="relative mr-2 mt-[5px] flex shrink-0">
        <span className={`block h-2 w-2 rounded-full ${dot}`} />
        {event.type === 'status' && (
          <span className={`absolute inset-0 animate-ping rounded-full ${dot} opacity-30`} />
        )}
      </span>

      {/* badge */}
      <span
        className={`mr-2 mt-px shrink-0 rounded px-1 py-px text-[10px] font-semibold leading-tight ${color} bg-muted`}
      >
        {label}
      </span>

      {/* content */}
      <div className="min-w-0 flex-1 leading-relaxed">
        <span className="text-foreground">{event.message}</span>
        {event.detail && (
          <span className="ml-1.5 text-muted-foreground">{event.detail}</span>
        )}
      </div>

      {/* icon + time */}
      <div className="ml-2 flex shrink-0 items-center gap-1.5 text-muted-foreground/50">
        <Icon className="h-3 w-3" />
        <span>{formatTime(event.timestamp)}</span>
      </div>
    </div>
  );
}

function ActivityFeed({ documentId }: { documentId: string }) {
  const { events } = useKnowledgeActivity(documentId);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events.length]);

  if (events.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Waiting for agent activity...
      </div>
    );
  }

  const tree = buildTree(events);
  const isComplete = events.some((e) => e.type === 'complete' || e.type === 'error');

  return (
    <div className="flex max-h-96 flex-col gap-px overflow-y-auto rounded-lg border bg-card p-3">
      {tree.map((node, ri) => (
        <div key={ri} className="flex flex-col gap-px">
          <TreeLine event={node.event} isLast={ri === tree.length - 1 && node.children.length === 0} depth={0} />
          {node.children.map((child, ci) => (
            <TreeLine
              key={ci}
              event={child.event}
              isLast={ci === node.children.length - 1}
              depth={1}
            />
          ))}
        </div>
      ))}

      {!isComplete && (
        <div className="mt-1 flex items-center gap-2 pl-0 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span className="animate-pulse">Processing...</span>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function UploadDialog() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { uploading } = useAppSelector((s) => s.knowledge);
  const [open, setOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      const doc = await dispatch(uploadDocument(file)).unwrap();
      setOpen(false);
      dispatch(fetchDocuments());
      navigate(`/app/knowledge/${doc.id}`);
    },
    [dispatch, navigate],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Upload className="mr-2 h-4 w-4" />
          Upload Document
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>
            Upload a file to be processed by the Knowledge Agent. Supported
            formats: PDF, TXT, Markdown, CSV, JSON, XML, HTML, PNG, JPEG, WebP, GIF.
          </DialogDescription>
        </DialogHeader>
        <div
          className={`mt-4 flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors ${
            dragOver
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25'
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          {uploading ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Uploading...</p>
            </>
          ) : (
            <>
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Drag and drop a file here, or
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
                accept=".pdf,.txt,.md,.csv,.json,.xml,.html,.png,.jpg,.jpeg,.webp,.gif"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DocumentRow({
  doc,
  onSelect,
  onDelete,
}: {
  doc: KnowledgeDocument;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  const displayName = doc.title || 'Untitled';
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            onClick={() => {
              onSelect();
              navigate(`/app/knowledge/${doc.id}`);
            }}
            className="flex w-full items-center gap-4 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{displayName}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                                {formatFileSize(doc.fileSize)} &middot;{' '}
                {new Date(doc.createdAt).toLocaleDateString()}
                {doc.uploadedBy && ` · ${doc.uploadedBy.name}`}
              </p>
              {doc.summary && (
                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                  {doc.summary}
                </p>
              )}
            </div>
            <StatusBadge status={doc.status} />
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete document
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{displayName}&quot; and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function DocumentDetail() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { selectedDocument: doc, loading } = useAppSelector(
    (s) => s.knowledge,
  );

  // Only show loading on initial document fetch, not background polls
  if (!doc && loading) return <LoadingState message="Loading document..." />;
  if (!doc) return null;

  const displayName = doc.title || 'Untitled';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            dispatch(clearSelectedDocument());
            navigate('/app/knowledge');
          }}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold">{displayName}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
                        {formatFileSize(doc.fileSize)} &middot; {doc.mimeType} &middot;{' '}
            {new Date(doc.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={doc.status} />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Document</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete &quot;{displayName}&quot; and all
                  its extracted knowledge chunks.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    dispatch(deleteDocument(doc.id));
                    navigate('/app/knowledge');
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {doc.summary && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="mb-2 text-sm font-semibold">Summary</h3>
            <div className="text-sm text-muted-foreground">
              <Markdown>{doc.summary}</Markdown>
            </div>
          </CardContent>
        </Card>
      )}

      {doc.topics && doc.topics.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {doc.topics.map((topic) => (
            <Badge key={topic} variant="secondary">
              {topic}
            </Badge>
          ))}
        </div>
      )}

      {doc.error && (
        <Card className="border-destructive/50">
          <CardContent className="pt-6">
            <h3 className="mb-2 text-sm font-semibold text-destructive">
              Error
            </h3>
            <p className="text-sm text-muted-foreground">{doc.error}</p>
          </CardContent>
        </Card>
      )}

      {doc.chunks && doc.chunks.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">
            Knowledge Chunks ({doc.chunks.length})
          </h3>
          {doc.chunks.map((chunk) => (
            <Card key={chunk.id}>
              <CardContent className="pt-4">
                <div className="mb-3 flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {chunk.contentType}
                  </Badge>
                  <span className="text-xs font-medium text-muted-foreground">
                    {chunk.section}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    &middot; {chunk.topic}
                  </span>
                </div>
                <div className="text-sm">
                  <Markdown>{chunk.content}</Markdown>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(doc.status === 'processing' || doc.status === 'pending') && (
        <div className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4 animate-pulse text-blue-500" />
            Agent Activity
          </h3>
          <ActivityFeed documentId={doc.id} />
        </div>
      )}
    </div>
  );
}

export function KnowledgePage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { documentId } = useParams<{ documentId?: string }>();
  const { documents, selectedDocument, loading, error } = useAppSelector(
    (s) => s.knowledge,
  );

  useEffect(() => {
    dispatch(fetchDocuments());
  }, [dispatch]);

  // Load document from URL param
  useEffect(() => {
    if (documentId && selectedDocument?.id !== documentId) {
      dispatch(fetchDocument(documentId));
    }
    if (!documentId && selectedDocument) {
      dispatch(clearSelectedDocument());
    }
  }, [dispatch, documentId, selectedDocument?.id]);

  // Poll for status updates while any document is processing
  useEffect(() => {
    const hasProcessing = documents.some(
      (d) => d.status === 'pending' || d.status === 'processing',
    );
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      dispatch(fetchDocuments());
    }, 5000);
    return () => clearInterval(interval);
  }, [documents, dispatch]);

  if (documentId) {
    return (
      <div className="flex flex-1 flex-col gap-8">
        <PageHeader
          title="Knowledge"
          subtitle="Structured business information and documentation."
        />
        <DocumentDetail />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeader
        title="Knowledge"
        subtitle="Structured business information and documentation."
        actions={<UploadDialog />}
      />

      {loading && documents.length === 0 && (
        <LoadingState message="Loading documents..." />
      )}

      {error && !loading && (
        <ErrorState
          message={error}
          onRetry={() => dispatch(fetchDocuments())}
        />
      )}

      {!loading && !error && documents.length === 0 && (
        <EmptyState
          icon={Brain}
          title="No knowledge entries"
          description="Upload documents to build your knowledge base. The Knowledge Agent will automatically extract and structure the information."
          action={<UploadDialog />}
        />
      )}

      {documents.length > 0 && (
        <div className="flex flex-col gap-2">
          {documents.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              onSelect={() => navigate(`/app/knowledge/${doc.id}`)}
              onDelete={() => dispatch(deleteDocument(doc.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
