import { useState, useCallback } from 'react';
import {
  Plus, Trash2, Pin, PinOff, Pencil, Loader2, MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn, formatRelativeDate } from '@/lib/utils';
import type { Conversation } from '@/store/conversation.slice';

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId?: string;
  type: 'chat' | 'content';
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onTogglePin: (id: string, isPinned: boolean) => void;
}

export function ConversationSidebar({
  conversations,
  activeId,
  type,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onTogglePin,
}: ConversationSidebarProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const startRename = useCallback((conv: Conversation) => {
    setRenamingId(conv.id);
    setRenameValue(conv.title ?? '');
  }, []);

  const submitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      onRename(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue('');
  }, [renamingId, renameValue, onRename]);

  const pinned = conversations.filter((c) => c.isPinned).sort((a, b) => (a.pinnedOrder ?? 0) - (b.pinnedOrder ?? 0));
  const unpinned = conversations.filter((c) => !c.isPinned);

  const renderItem = (conv: Conversation) => {
    const isActive = conv.id === activeId;

    if (renamingId === conv.id) {
      return (
        <div key={conv.id} className="px-1 py-0.5">
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitRename();
              if (e.key === 'Escape') setRenamingId(null);
            }}
            onBlur={submitRename}
            className="h-8 text-xs"
          />
        </div>
      );
    }

    return (
      <ContextMenu key={conv.id}>
        <ContextMenuTrigger asChild>
          <button
            onClick={() => onSelect(conv.id)}
            className={cn(
              'group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors',
              isActive
                ? 'bg-primary/10 text-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <MessageSquare className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-primary' : 'opacity-40')} />
            <div className="min-w-0 flex-1">
              <p className={cn('text-xs truncate', isActive && 'font-medium')}>
                {conv.title ?? 'Untitled'}
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                {formatRelativeDate(conv.updatedAt)}
              </p>
            </div>
            {conv.isPinned && <Pin className="h-2.5 w-2.5 shrink-0 text-primary/40" />}
            {conv.status === 'generating' && <Loader2 className="h-3 w-3 animate-spin shrink-0 text-primary" />}
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-44">
          <ContextMenuItem onClick={() => startRename(conv)}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Rename
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onTogglePin(conv.id, !conv.isPinned)}>
            {conv.isPinned ? <PinOff className="mr-2 h-3.5 w-3.5" /> : <Pin className="mr-2 h-3.5 w-3.5" />}
            {conv.isPinned ? 'Unpin' : 'Pin to top'}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => onDelete(conv.id)} className="text-destructive focus:text-destructive">
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <Button
        className="w-full gap-2 text-xs font-medium"
        size="sm"
        onClick={onNew}
      >
        <Plus className="h-3.5 w-3.5" />
        New {type === 'chat' ? 'Chat' : 'Brainstorm'}
      </Button>

      <div className="space-y-3">
        {pinned.length > 0 && (
          <div className="space-y-0.5">
            <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              Pinned
            </p>
            {pinned.map(renderItem)}
          </div>
        )}

        {unpinned.length > 0 && (
          <div className="space-y-0.5">
            {pinned.length > 0 && (
              <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                Recent
              </p>
            )}
            {unpinned.map(renderItem)}
          </div>
        )}

        {conversations.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground/60">
              No conversations yet
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
