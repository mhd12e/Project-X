import { useState, useEffect, useCallback } from 'react';
import {
  Archive, Image as ImageIcon, FileText, Video, File,
  Grid3X3, List, Search, Trash2, ExternalLink, Download,
  Sparkles, Brain, MessageSquare, Bot, Upload, X,
} from 'lucide-react';
import { Meta } from '@/components/shared/meta';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  fetchArtifacts,
  fetchArtifactCounts,
  deleteArtifact,
  type Artifact,
} from '@/store/artifact.slice';

const TYPE_ICONS: Record<string, typeof ImageIcon> = {
  image: ImageIcon,
  document: FileText,
  video: Video,
  file: File,
};

const SOURCE_ICONS: Record<string, typeof Sparkles> = {
  content: Sparkles,
  knowledge: Brain,
  chat: MessageSquare,
  agent: Bot,
  upload: Upload,
};

const TYPE_LABELS: Record<string, string> = {
  image: 'Images',
  document: 'Documents',
  video: 'Videos',
  file: 'Files',
};

const SOURCE_LABELS: Record<string, string> = {
  content: 'Content',
  knowledge: 'Knowledge',
  chat: 'Chat',
  agent: 'Agent',
  upload: 'Upload',
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function ArtifactGridCard({ artifact, onClick }: { artifact: Artifact; onClick: () => void }) {
  const TypeIcon = TYPE_ICONS[artifact.type] ?? File;
  const isImage = artifact.type === 'image';

  return (
    <Card
      className="group cursor-pointer overflow-hidden transition-all hover:border-primary/30 hover:shadow-sm"
      onClick={onClick}
    >
      <div className="relative aspect-square bg-muted">
        {isImage ? (
          <img
            src={artifact.url}
            alt={artifact.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <TypeIcon className="h-10 w-10 text-muted-foreground/40" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 transition-opacity group-hover:opacity-100">
          <p className="text-xs font-medium text-white truncate">{artifact.name}</p>
        </div>
      </div>
      <CardContent className="p-2.5">
        <p className="text-xs font-medium truncate">{artifact.name}</p>
        <div className="mt-1 flex items-center gap-1.5">
          <Badge variant="secondary" className="text-[9px] px-1 py-0">
            {SOURCE_LABELS[artifact.source] ?? artifact.source}
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            {formatFileSize(artifact.fileSize)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function ArtifactListRow({ artifact, onClick }: { artifact: Artifact; onClick: () => void }) {
  const TypeIcon = TYPE_ICONS[artifact.type] ?? File;
  const SourceIcon = SOURCE_ICONS[artifact.source] ?? File;

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left transition-all hover:border-primary/30 hover:shadow-sm"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
        {artifact.type === 'image' ? (
          <img src={artifact.url} alt="" className="h-full w-full rounded-lg object-cover" />
        ) : (
          <TypeIcon className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{artifact.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <SourceIcon className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{artifact.sourceContext ?? SOURCE_LABELS[artifact.source]}</span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs text-muted-foreground">{formatFileSize(artifact.fileSize)}</p>
        <p className="text-[10px] text-muted-foreground">{formatDate(artifact.createdAt)}</p>
      </div>
    </button>
  );
}

function ArtifactPreviewDialog({
  artifact,
  open,
  onClose,
  onDelete,
}: {
  artifact: Artifact | null;
  open: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  if (!artifact) return null;
  const SourceIcon = SOURCE_ICONS[artifact.source] ?? File;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm truncate">{artifact.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {artifact.type === 'image' && (
            <div className="relative overflow-hidden rounded-lg border bg-muted">
              <img
                src={artifact.url}
                alt={artifact.name}
                className="w-full object-contain max-h-[400px]"
              />
            </div>
          )}

          {artifact.description && (
            <p className="text-xs text-muted-foreground">{artifact.description}</p>
          )}

          <div className="grid grid-cols-2 gap-3 rounded-lg border p-3 text-xs">
            <div>
              <span className="text-muted-foreground">Type</span>
              <p className="font-medium capitalize">{artifact.type}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Source</span>
              <p className="flex items-center gap-1 font-medium">
                <SourceIcon className="h-3 w-3" />
                {SOURCE_LABELS[artifact.source]}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Size</span>
              <p className="font-medium">{formatFileSize(artifact.fileSize)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Created</span>
              <p className="font-medium">{formatDate(artifact.createdAt)}</p>
            </div>
            {artifact.sourceContext && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Context</span>
                <p className="font-medium">{artifact.sourceContext}</p>
              </div>
            )}
          </div>

          <div className="flex justify-between">
            <div className="flex gap-2">
              <a href={artifact.url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <ExternalLink className="h-3 w-3" />
                  Open
                </Button>
              </a>
              <a href={artifact.url} download={artifact.name}>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <Download className="h-3 w-3" />
                  Download
                </Button>
              </a>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => { onDelete(artifact.id); onClose(); }}
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ArtifactsPage(): React.ReactElement {
  const dispatch = useAppDispatch();
  const { items, counts, loading } = useAppSelector((s) => s.artifact);

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);

  const load = useCallback(() => {
    dispatch(fetchArtifacts({
      type: typeFilter !== 'all' ? typeFilter : undefined,
      source: sourceFilter !== 'all' ? sourceFilter : undefined,
      search: search || undefined,
    }));
  }, [dispatch, typeFilter, sourceFilter, search]);

  useEffect(() => {
    load();
    dispatch(fetchArtifactCounts());
  }, [load, dispatch]);

  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);

  const handleDelete = useCallback((id: string) => {
    dispatch(deleteArtifact(id));
  }, [dispatch]);

  return (
    <>
      <Meta title="Artifacts" description="Browse all generated content" />
      <PageHeader
        title="Artifacts"
        subtitle={`${totalCount} item${totalCount !== 1 ? 's' : ''} in vault`}
      />

      {/* Stat cards */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(['image', 'document', 'video', 'file'] as const).map((type) => {
          const Icon = TYPE_ICONS[type];
          const count = counts[type] ?? 0;
          return (
            <button
              key={type}
              onClick={() => setTypeFilter(typeFilter === type ? 'all' : type)}
              className={`flex items-center gap-3 rounded-lg border p-3 transition-all ${
                typeFilter === type ? 'border-primary bg-primary/5' : 'hover:border-primary/30'
              }`}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-left">
                <p className="text-lg font-bold leading-none">{count}</p>
                <p className="text-[10px] text-muted-foreground">{TYPE_LABELS[type]}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="mt-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search artifacts..."
            className="pl-8 text-sm h-9"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[140px] h-9 text-xs">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Sources</SelectItem>
            {Object.entries(SOURCE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex rounded-md border">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 ${viewMode === 'grid' ? 'bg-muted' : 'hover:bg-muted/50'}`}
          >
            <Grid3X3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 ${viewMode === 'list' ? 'bg-muted' : 'hover:bg-muted/50'}`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="mt-4">
        {loading ? (
          <div className={viewMode === 'grid'
            ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
            : 'space-y-2'
          }>
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className={viewMode === 'grid' ? 'aspect-square rounded-lg' : 'h-16 rounded-lg'} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Archive}
            title="No artifacts yet"
            description="Generated content from AI agents will appear here — images, documents, and more."
          />
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((a) => (
              <ArtifactGridCard key={a.id} artifact={a} onClick={() => setSelectedArtifact(a)} />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((a) => (
              <ArtifactListRow key={a.id} artifact={a} onClick={() => setSelectedArtifact(a)} />
            ))}
          </div>
        )}
      </div>

      <ArtifactPreviewDialog
        artifact={selectedArtifact}
        open={!!selectedArtifact}
        onClose={() => setSelectedArtifact(null)}
        onDelete={handleDelete}
      />
    </>
  );
}
