import { useEffect, useRef, useState, useCallback, memo, forwardRef, useImperativeHandle } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Markdown } from '@/components/shared/markdown';
import { Meta } from '@/components/shared/meta';
import { toast } from 'sonner';
import {
  MessageSquare,
  Plus,
  Send,
  Trash2,
  Loader2,
  User,
  Bot,
  Search,
  FileText,
  Lightbulb,
  Wrench,
  ChevronDown,
  ChevronRight,
  Copy,
  Pencil,
  Globe,
  Database,
  BookOpen,
  Pin,
  PinOff,
  GripVertical,
} from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadingState } from '@/components/shared/loading-state';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  fetchConversations,
  fetchConversation,
  sendMessage,
  deleteConversation,
  createConversationAndSend,
  startDraftConversation,
  finalizeStreamedMessage,
  updateConversationTitle,
  togglePin,
  reorderPinned,
  type ChatMessage,
} from '@/store/chat.slice';
import {
  useChatStream,
  type StreamSegment,
} from '@/hooks/use-chat-stream';
import api from '@/lib/api';

// ---- Inline tool call indicator (like ChatGPT / Claude) ----

const TOOL_ICONS: Record<string, typeof Wrench> = {
  search_knowledge: Search,
  get_document_info: FileText,
  list_documents: BookOpen,
};

function getToolIcon(toolName: string) {
  // Check exact match first
  if (TOOL_ICONS[toolName]) return TOOL_ICONS[toolName];
  // Apify tools
  if (toolName.startsWith('apify') || toolName.includes('actor') || toolName.includes('scrape') || toolName.includes('crawl')) return Globe;
  // Database/storage
  if (toolName.includes('storage') || toolName.includes('dataset')) return Database;
  return Wrench;
}

function getToolLabel(toolName: string, description?: string): string {
  // Prefer the human-readable description from the backend
  if (description) return description;
  // Fallback for older messages without description
  if (toolName === 'search_knowledge') return 'Searched knowledge base';
  if (toolName === 'get_document_info') return 'Retrieved document info';
  if (toolName === 'list_documents') return 'Browsed knowledge base';
  return toolName.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatToolInput(toolInput?: string): string | null {
  if (!toolInput) return null;
  try {
    const parsed = JSON.parse(toolInput);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return toolInput;
  }
}

function InlineToolCall({
  toolName,
  toolInput,
  toolResult,
  description,
  animate,
}: {
  toolName: string;
  toolInput?: string;
  toolResult?: string;
  description?: string;
  animate?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = getToolIcon(toolName);
  const label = getToolLabel(toolName, description);
  const formattedInput = formatToolInput(toolInput);

  return (
    <div className="my-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/60 transition-colors text-left"
      >
        {animate ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-amber-500" />
        ) : (
          <Icon className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        )}
        <span className="flex-1 truncate">{label}</span>
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/60" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
        )}
      </button>
      {expanded && (
        <div className="mt-1 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Wrench className="h-3 w-3" />
            <span className="font-mono">{toolName}</span>
          </div>
          {formattedInput && (
            <div>
              <span className="text-muted-foreground/70 font-medium">Input:</span>
              <pre className="mt-1 rounded-md bg-background/60 p-2 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap break-all">
                {formattedInput}
              </pre>
            </div>
          )}
          {toolResult && (
            <div>
              <span className="text-muted-foreground/70 font-medium">Output:</span>
              <pre className="mt-1 rounded-md bg-background/60 p-2 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap break-all">
                {toolResult}
              </pre>
            </div>
          )}
          {!toolResult && animate && (
            <div className="flex items-center gap-2 text-muted-foreground/60 italic">
              <Loader2 className="h-3 w-3 animate-spin" />
              Running...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Source citation badge ----

function InlineSource({ source }: { source: { documentId: string; sourceFile: string; section: string; topic: string; score: number } }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="my-1">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-2 py-1 text-xs text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors"
      >
        <FileText className="h-3 w-3" />
        {source.sourceFile}
        <span className="text-blue-400 dark:text-blue-600">({source.score.toFixed(2)})</span>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {open && (
        <div className="mt-1 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-2 text-xs text-muted-foreground">
          <span className="font-medium">{source.section}</span>
          {source.topic && <span className="ml-2 text-blue-500">#{source.topic}</span>}
        </div>
      )}
    </div>
  );
}

// ---- Thinking indicator ----

function InlineThinking({ content }: { content: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="my-1">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-md border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 px-2 py-1 text-xs text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-950/50 transition-colors"
      >
        <Lightbulb className="h-3 w-3" />
        Thought process
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {open && (
        <div className="mt-1 rounded-md border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20 p-2 text-xs text-muted-foreground italic whitespace-pre-wrap">
          {content}
        </div>
      )}
    </div>
  );
}

// ---- Render an ordered list of segments ----

function SegmentList({ segments, isStreaming }: { segments: StreamSegment[]; isStreaming?: boolean }) {
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === 'text') {
          const isLast = i === segments.length - 1;
          return (
            <div key={i} className="text-left prose-sm">
              <Markdown>{seg.content || ' '}</Markdown>
              {isStreaming && isLast && (
                <span className="inline-block h-4 w-1 animate-pulse bg-foreground/60 ml-0.5 align-middle" />
              )}
            </div>
          );
        }
        if (seg.type === 'tool_call') {
          // Animate if this is the last segment or no text/tool follows yet (tool still running)
          const hasFollowingContent = segments.slice(i + 1).some(s => s.type === 'text' || s.type === 'tool_call');
          const stillRunning = isStreaming && !hasFollowingContent && !seg.toolResult;
          return (
            <InlineToolCall
              key={i}
              toolName={seg.toolName}
              toolInput={seg.toolInput}
              toolResult={seg.toolResult}
              description={seg.description}
              animate={stillRunning}
            />
          );
        }
        if (seg.type === 'source') {
          return <InlineSource key={i} source={seg.source} />;
        }
        if (seg.type === 'thinking') {
          return <InlineThinking key={i} content={seg.content} />;
        }
        return null;
      })}
    </>
  );
}

// ---- Streaming message bubble ----

function StreamingBubble({ segments }: { segments: StreamSegment[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [segments]);

  const hasContent = segments.length > 0;

  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <Bot className="h-4 w-4" />
      </div>
      <div className="min-w-0 max-w-[80%]" ref={containerRef}>
        <div className="inline-block rounded-2xl px-4 py-2.5 text-sm bg-muted">
          {!hasContent ? (
            <span className="text-muted-foreground italic flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Thinking...
            </span>
          ) : (
            <SegmentList segments={segments} isStreaming />
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Finalized message bubble ----

/** Build inline segments from saved message metadata */
function buildSavedSegments(msg: ChatMessage): StreamSegment[] {
  const meta = (msg.metadata ?? {}) as Record<string, unknown>;

  // If segments were saved from the streaming session, use them directly
  if (Array.isArray(meta.segments)) {
    return meta.segments as StreamSegment[];
  }

  // Fallback for older messages: reconstruct from toolCalls/sources
  const segments: StreamSegment[] = [];

  if (Array.isArray(meta.toolCalls)) {
    for (const tc of meta.toolCalls as Array<{ toolName: string; toolInput?: string; description?: string; toolResult?: string }>) {
      segments.push({ type: 'tool_call', toolName: tc.toolName, toolInput: tc.toolInput, description: tc.description, toolResult: tc.toolResult });
    }
  }

  if (Array.isArray(meta.sources)) {
    for (const src of meta.sources as Array<{ documentId: string; sourceFile: string; section: string; topic: string; score: number }>) {
      segments.push({ type: 'source', source: src });
    }
  }

  if (msg.content) {
    segments.push({ type: 'text', content: msg.content });
  }

  return segments;
}

const MessageBubble = memo(function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content).then(() => {
      toast.success('Copied to clipboard');
    });
  };

  const segments = !isUser ? buildSavedSegments(message) : [];

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="flex gap-3">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
            }`}
          >
            {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
          </div>
          <div className="min-w-0 max-w-[80%]">
            <div
              className={`inline-block rounded-2xl px-4 py-2.5 text-sm ${
                isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
              }`}
            >
              {isUser ? (
                <p className="whitespace-pre-wrap">{message.content}</p>
              ) : (
                <SegmentList segments={segments} />
              )}
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={handleCopy}>
          <Copy className="mr-2 h-4 w-4" />
          Copy message
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

// ---- Conversation sidebar item ----

function ConversationItem({
  title,
  isActive,
  isPinned,
  draggable: canDrag,
  onSelect,
  onDelete,
  onRename,
  onTogglePin,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  id: string;
  title: string | null;
  isActive: boolean;
  isPinned: boolean;
  draggable?: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
  onTogglePin: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(title || '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleRenameSubmit = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== title) {
      onRename(trimmed);
    }
    setRenaming(false);
  };

  if (renaming) {
    return (
      <div className="flex items-center gap-1 rounded-lg px-2 py-1.5">
        <Input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRenameSubmit();
            if (e.key === 'Escape') setRenaming(false);
          }}
          onBlur={handleRenameSubmit}
          className="h-7 text-sm"
        />
      </div>
    );
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={`group flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm cursor-pointer transition-colors ${
              isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
            }`}
            onClick={onSelect}
            draggable={canDrag}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
          >
            {canDrag && (
              <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
            )}
            {isPinned && (
              <Pin className="h-3 w-3 shrink-0 text-muted-foreground/60" />
            )}
            <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">
              {title || 'New conversation'}
            </span>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={onTogglePin}>
            {isPinned ? (
              <>
                <PinOff className="mr-2 h-4 w-4" />
                Unpin
              </>
            ) : (
              <>
                <Pin className="mr-2 h-4 w-4" />
                Pin to top
              </>
            )}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => {
            setRenameValue(title || '');
            setRenaming(true);
          }}>
            <Pencil className="mr-2 h-4 w-4" />
            Rename
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this conversation and all its messages.
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

// ---- Chat input ----

interface ChatInputHandle {
  focus: () => void;
}

const ChatInput = forwardRef<ChatInputHandle, { onSend: (message: string) => void; disabled: boolean }>(function ChatInput({ onSend, disabled }, ref) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }));

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    }
  };

  return (
    <div className="flex items-end gap-2 border-t bg-background p-4">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          handleInput();
        }}
        onKeyDown={handleKeyDown}
        placeholder="Ask anything about your knowledge base..."
        className="min-h-[44px] max-h-[200px] resize-none"
        rows={1}
        disabled={disabled}
      />
      <Button
        size="icon"
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        className="h-11 w-11 shrink-0"
      >
        {disabled ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
});

// ---- Main chat page ----

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 256;

export function ChatPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { conversationId: urlConvId } = useParams<{ conversationId?: string }>();
  const {
    conversations,
    activeConversation,
    pinnedIds,
    loading,
    sending,
  } = useAppSelector((s) => s.chat);
  const { activities, segments, streamingText, clear: clearStream } = useChatStream(activeConversation?.id);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);

  // Track the last 'done' event to know when to finalize
  const lastDoneRef = useRef<string | null>(null);

  // Pin-aware conversation lists
  const pinnedSet = new Set(pinnedIds);
  const pinnedConversations = pinnedIds
    .map((id) => conversations.find((c) => c.id === id))
    .filter(Boolean) as typeof conversations;
  const unpinnedConversations = conversations.filter((c) => !pinnedSet.has(c.id));

  // Drag-and-drop state for pinned reordering
  const dragIdRef = useRef<string | null>(null);

  // Resizable sidebar
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const containerLeft = containerRef.current.getBoundingClientRect().left;
      const newWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, e.clientX - containerLeft));
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Fetch conversation list on mount
  useEffect(() => {
    dispatch(fetchConversations());
  }, [dispatch]);

  // Load conversation from URL param
  useEffect(() => {
    if (urlConvId === 'new') {
      if (activeConversation?.id !== '__draft__') {
        clearStream();
        lastDoneRef.current = null;
        dispatch(startDraftConversation());
      }
      return;
    }
    if (urlConvId && urlConvId !== activeConversation?.id) {
      clearStream();
      lastDoneRef.current = null;
      dispatch(fetchConversation(urlConvId));
    }
  }, [urlConvId, activeConversation?.id, dispatch, clearStream]);

  // Handle 'done', 'error', and 'title_updated' events from activity stream
  useEffect(() => {
    if (!activeConversation?.id) return;
    const convId = activeConversation.id;

    for (const act of activities) {
      if (act.type === 'title_updated' && act.content) {
        dispatch(updateConversationTitle({ id: convId, title: act.content }));
      }
      if (act.type === 'done' && act.messageId && act.messageId !== lastDoneRef.current) {
        lastDoneRef.current = act.messageId;

        // Save segments snapshot so finalized message renders identically
        const metadata: Record<string, unknown> = { segments };

        dispatch(finalizeStreamedMessage({
          conversationId: convId,
          messageId: act.messageId,
          content: streamingText,
          metadata,
        }));

        dispatch(fetchConversations());
        setTimeout(() => chatInputRef.current?.focus(), 0);
      }
      if (act.type === 'error' && !lastDoneRef.current) {
        lastDoneRef.current = '__error__';
        dispatch(finalizeStreamedMessage({
          conversationId: convId,
          messageId: '__error__',
          content: streamingText,
          metadata: segments.length > 0 ? { segments } : null,
        }));
        setTimeout(() => chatInputRef.current?.focus(), 0);
      }
    }
  }, [activities, activeConversation?.id, dispatch, streamingText, segments]);

  // Auto-scroll on new messages or streaming segments
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages?.length, segments]);

  const handleNewConversation = () => {
    clearStream();
    lastDoneRef.current = null;
    dispatch(startDraftConversation());
    navigate('/app/chat/new');
  };

  const handleSelectConversation = (id: string) => {
    clearStream();
    lastDoneRef.current = null;
    navigate(`/app/chat/${id}`);
  };

  const handleDeleteConversation = (id: string) => {
    dispatch(deleteConversation(id));
    if (activeConversation?.id === id) {
      navigate('/app/chat');
    }
  };

  const handleRenameConversation = async (id: string, newTitle: string) => {
    try {
      await api.patch(`/chat/conversations/${id}`, { title: newTitle });
      dispatch(updateConversationTitle({ id, title: newTitle }));
    } catch {
      toast.error('Failed to rename conversation');
    }
  };

  const handleSend = async (message: string) => {
    if (!activeConversation) return;
    clearStream();
    lastDoneRef.current = null;

    if (activeConversation.id === '__draft__') {
      const result = await dispatch(createConversationAndSend({ message })).unwrap();
      navigate(`/app/chat/${result.conversation.id}`, { replace: true });
    } else {
      await dispatch(
        sendMessage({ conversationId: activeConversation.id, message }),
      );
    }
  };

  const messages = activeConversation?.messages ?? [];
  const isStreaming = sending || (streamingText.length > 0 && !lastDoneRef.current);
  const showStreamingBubble = sending || (segments.length > 0 && !activities.some(a => a.type === 'done'));

  const chatTitle = activeConversation?.title || (activeConversation ? 'New conversation' : 'Chat');

  return (
    <>
    <Meta title={chatTitle} />
    <div className="flex h-[calc(100vh-3.5rem)] flex-col -m-6">
      <div ref={containerRef} className="flex min-h-0 flex-1">
        {/* Sidebar: conversation list */}
        <div
          className="relative flex shrink-0 flex-col border-r bg-muted/20"
          style={{ width: sidebarWidth }}
        >
          <div className="flex items-center justify-between border-b p-3">
            <h2 className="text-sm font-semibold">Chats</h2>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleNewConversation}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {conversations.length === 0 ? (
              <p className="p-3 text-center text-xs text-muted-foreground">No conversations yet</p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {pinnedConversations.length > 0 && (
                  <>
                    <p className="px-2 pt-1 pb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                      Pinned
                    </p>
                    {pinnedConversations.map((c) => (
                      <ConversationItem
                        key={c.id}
                        id={c.id}
                        title={c.title}
                        isActive={activeConversation?.id === c.id}
                        isPinned
                        draggable
                        onSelect={() => handleSelectConversation(c.id)}
                        onDelete={() => handleDeleteConversation(c.id)}
                        onRename={(newTitle) => handleRenameConversation(c.id, newTitle)}
                        onTogglePin={() => dispatch(togglePin(c.id))}
                        onDragStart={(e) => {
                          dragIdRef.current = c.id;
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const fromId = dragIdRef.current;
                          if (!fromId || fromId === c.id) return;
                          const newOrder = [...pinnedIds];
                          const fromIdx = newOrder.indexOf(fromId);
                          const toIdx = newOrder.indexOf(c.id);
                          if (fromIdx < 0 || toIdx < 0) return;
                          newOrder.splice(fromIdx, 1);
                          newOrder.splice(toIdx, 0, fromId);
                          dispatch(reorderPinned(newOrder));
                        }}
                        onDragEnd={() => { dragIdRef.current = null; }}
                      />
                    ))}
                    {unpinnedConversations.length > 0 && (
                      <div className="my-1 border-t border-border/40" />
                    )}
                  </>
                )}
                {unpinnedConversations.map((c) => (
                  <ConversationItem
                    key={c.id}
                    id={c.id}
                    title={c.title}
                    isActive={activeConversation?.id === c.id}
                    isPinned={false}
                    onSelect={() => handleSelectConversation(c.id)}
                    onDelete={() => handleDeleteConversation(c.id)}
                    onRename={(newTitle) => handleRenameConversation(c.id, newTitle)}
                    onTogglePin={() => dispatch(togglePin(c.id))}
                  />
                ))}
              </div>
            )}
          </div>
          {/* Drag handle */}
          <div
            className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors"
            onMouseDown={(e) => {
              e.preventDefault();
              isDragging.current = true;
              document.body.style.cursor = 'col-resize';
              document.body.style.userSelect = 'none';
            }}
          />
        </div>

        {/* Main chat area */}
        <div className="flex flex-1 flex-col">
          {!activeConversation ? (
            <div className="flex flex-1 items-center justify-center">
              {loading ? (
                <LoadingState message="Loading conversation..." />
              ) : (
                <EmptyState
                  icon={MessageSquare}
                  title="Start a conversation"
                  description="Ask questions about your knowledge base. The AI will search your documents and provide sourced answers."
                  action={
                    <Button onClick={handleNewConversation}>
                      <Plus className="mr-2 h-4 w-4" />
                      New Conversation
                    </Button>
                  }
                />
              )}
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {messages.length === 0 && !showStreamingBubble ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-center">
                      <Bot className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">
                        Ask me anything about your knowledge base.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="mx-auto flex max-w-3xl flex-col gap-4">
                    {messages.map((msg) => (
                      <MessageBubble key={msg.id} message={msg} />
                    ))}
                    {showStreamingBubble && (
                      <StreamingBubble segments={segments} />
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="mx-auto w-full max-w-3xl">
                <ChatInput ref={chatInputRef} onSend={handleSend} disabled={isStreaming} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
