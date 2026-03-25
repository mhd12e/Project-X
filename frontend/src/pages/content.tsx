import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Bot, Brain, Search, Globe,
  Sparkles, Image as ImageIcon, Video, Clock,
  Lightbulb, Loader2, Wand2, Tag,
} from 'lucide-react';
import { Meta } from '@/components/shared/meta';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  fetchConversations,
  fetchConversation,
  createConversation,
  sendMessage,
  createConversationAndSend,
  deleteConversation,
  updateConversation,
  clearActiveConversation,
  finalizeStreamedMessage,
  updateTitle,
} from '@/store/conversation.slice';
import { fetchIdeas, fetchProviders, generateImage } from '@/store/content.slice';
import { useConversationStream } from '@/hooks/use-conversation-stream';
import { ConversationSidebar } from '@/components/conversation/conversation-sidebar';
import { MessageBubble } from '@/components/conversation/message-bubble';
import { StreamingBubble } from '@/components/conversation/streaming-bubble';
import { ChatInput } from '@/components/conversation/chat-input';
import type { ContentBlock } from '@/types/content-block';

const CATEGORY_LABELS: Record<string, string> = {
  social_media: 'Social Media', blog_post: 'Blog Post', video: 'Video', email: 'Email',
  infographic: 'Infographic', case_study: 'Case Study', whitepaper: 'Whitepaper',
  ad_copy: 'Ad Copy', newsletter: 'Newsletter',
};

// ---- Read-only Idea Card ----

function IdeaCard({ idea }: {
  idea: { id: string; title: string; description: string; category?: string | null };
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-3 transition-colors hover:border-primary/20">
      <Lightbulb className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold">{idea.title}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">{idea.description}</p>
        {idea.category && (
          <Badge variant="secondary" className="mt-1.5 text-[9px]">
            <Tag className="mr-1 h-2 w-2" />
            {CATEGORY_LABELS[idea.category] ?? idea.category}
          </Badge>
        )}
      </div>
    </div>
  );
}

// ---- Welcome screens ----

function ChatWelcome() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-5">
        <Bot className="h-7 w-7 text-primary" />
      </div>
      <h2 className="text-lg font-semibold">How can I help you today?</h2>
      <p className="mt-1.5 text-sm text-muted-foreground text-center max-w-md">
        Ask me anything about your business data, documents, or the web. I can search your knowledge base, browse the internet, and analyze information.
      </p>
      <div className="mt-8 grid grid-cols-2 gap-3 max-w-lg w-full">
        {[
          { icon: Brain, label: 'Search knowledge base', hint: 'Find insights from your documents' },
          { icon: Search, label: 'Analyze data', hint: 'Get summaries and trends' },
          { icon: Globe, label: 'Web research', hint: 'Search for current information' },
          { icon: Sparkles, label: 'Generate content', hint: 'Create reports and summaries' },
        ].map(({ icon: Icon, label, hint }) => (
          <div
            key={label}
            className="flex items-start gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted/50 hover:border-primary/20 cursor-default"
          >
            <Icon className="h-4 w-4 shrink-0 mt-0.5 text-primary/60" />
            <div>
              <p className="text-xs font-medium">{label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContentWelcome() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-5">
        <Sparkles className="h-7 w-7 text-primary" />
      </div>
      <h2 className="text-lg font-semibold">Content Brainstorm</h2>
      <p className="mt-1.5 text-sm text-muted-foreground text-center max-w-md">
        Describe what you need and the AI will generate content ideas. You can then refine, add, remove, or edit ideas through conversation.
      </p>
      <div className="mt-8 grid grid-cols-2 gap-3 max-w-lg w-full">
        {[
          { label: 'Social campaigns', hint: 'Launch strategies, ad copy, post ideas' },
          { label: 'Blog content', hint: 'Article topics, outlines, series planning' },
          { label: 'Email sequences', hint: 'Drip campaigns, newsletters, nurture flows' },
          { label: 'Brand content', hint: 'Case studies, whitepapers, infographics' },
        ].map(({ label, hint }) => (
          <div key={label} className="rounded-xl border p-3 hover:bg-muted/50 hover:border-primary/20 cursor-default transition-colors">
            <p className="text-xs font-medium">{label}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Main Page ----

export function ContentPage(): React.ReactElement {
  const { conversationId: urlConvId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { conversations, activeConversation, loading, sending } = useAppSelector((s) => s.conversation);
  const { providers, generatingImage } = useAppSelector((s) => s.content);

  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('brainstorm');
  const [selectedProvider, setSelectedProvider] = useState('nano_banana');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastDoneRef = useRef<string | null>(null);
  const lastTitleRef = useRef<string | null>(null);

  // Detect conversation type — defaults to 'content' when no conversation is loaded
  // When a urlConvId exists but conversation hasn't loaded yet, we're in a loading state
  const isLoadingConv = !!urlConvId && !activeConversation;
  const convType = activeConversation?.type ?? 'content';
  const isChat = convType === 'chat';

  const sidebarConversations = conversations.filter((c) => c.type === convType);
  const convId = activeConversation?.id ?? urlConvId;

  const { activities, segments, streamingText, streamedIdeas, clear: clearStream } = useConversationStream(convId);

  const isDone = activities.some((a) => a.type === 'done' || a.type === 'error');
  const showStreamingBubble = segments.length > 0 && !isDone;
  const isStreaming = convId ? !isDone && (sending || activities.length > 0) : false;

  // Fetch sidebar conversations for the detected type
  useEffect(() => {
    dispatch(fetchConversations(convType));
    if (!isChat) {
      dispatch(fetchProviders());
      dispatch(fetchIdeas());
    }
  }, [dispatch, convType, isChat]);

  useEffect(() => {
    if (urlConvId && urlConvId !== activeConversation?.id) {
      dispatch(fetchConversation(urlConvId));
    }
    if (!urlConvId && activeConversation) {
      dispatch(clearActiveConversation());
    }
  }, [urlConvId, activeConversation?.id, dispatch]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages, segments]);

  // Finalize streamed message on done/error
  useEffect(() => {
    if (!convId) return;
    for (const act of activities) {
      if (act.type === 'done' && act.messageId && lastDoneRef.current !== act.messageId) {
        lastDoneRef.current = act.messageId;
        const blocks: ContentBlock[] = segments.map((seg) => {
          if (seg.type === 'text') return { type: 'text' as const, text: seg.content };
          if (seg.type === 'tool_call') return { type: 'tool_call' as const, toolName: seg.toolName, toolInput: seg.toolInput, description: seg.description, toolResult: seg.toolResult };
          if (seg.type === 'thinking') return { type: 'thinking' as const, text: seg.content };
          if (seg.type === 'source') return { type: 'source' as const, ...seg.source };
          return { type: 'text' as const, text: '' };
        });
        dispatch(finalizeStreamedMessage({
          conversationId: convId,
          messageId: act.messageId,
          contentBlocks: blocks,
          plainText: streamingText,
        }));
        clearStream();
        // Refetch ideas from API so the summary panel stays in sync
        if (!isChat) dispatch(fetchIdeas());
      }
      if (act.type === 'error' && !lastDoneRef.current?.startsWith('__error')) {
        lastDoneRef.current = `__error_${Date.now()}__`;
        dispatch(finalizeStreamedMessage({
          conversationId: convId,
          messageId: lastDoneRef.current,
          contentBlocks: [{ type: 'error', text: act.content ?? 'Something went wrong.' }],
          plainText: act.content ?? 'Something went wrong.',
        }));
        clearStream();
      }
      if (act.type === 'title_updated' && act.content && lastTitleRef.current !== act.content) {
        lastTitleRef.current = act.content;
        dispatch(updateTitle({ id: convId, title: act.content }));
        dispatch(fetchConversations(convType));
      }
    }
  }, [activities, convId, segments, streamingText, dispatch, clearStream, isChat, convType]);

  // Show toast on image generation errors
  const lastImageErrorRef = useRef<string | null>(null);
  useEffect(() => {
    for (const act of activities) {
      if (act.type === 'image_error' && act.imageId && act.imageId !== lastImageErrorRef.current) {
        lastImageErrorRef.current = act.imageId;
        toast.error(act.content ?? 'Image generation failed');
      }
      if (act.type === 'image_complete' && act.imageId) {
        toast.success('Image generated successfully');
      }
    }
  }, [activities]);

  const handleSend = useCallback(async () => {
    const msg = message.trim();
    if (!msg) return;
    setMessage('');
    lastDoneRef.current = null;
    lastTitleRef.current = null;
    clearStream();

    if (!convId || convId === '__draft__') {
      if (isChat) {
        const result = await dispatch(createConversationAndSend({ type: 'chat', message: msg })).unwrap();
        navigate(`/app/content/${result.conversation.id}`, { replace: true });
      } else {
        const result = await dispatch(createConversation({ type: 'content', message: msg })).unwrap();
        navigate(`/app/content/${result.id}`, { replace: true });
      }
    } else {
      dispatch(sendMessage({ conversationId: convId, message: msg }));
    }
  }, [message, convId, dispatch, navigate, clearStream, isChat]);

  const handleSelect = useCallback((id: string) => {
    clearStream(); lastDoneRef.current = null; lastTitleRef.current = null;
    dispatch(clearActiveConversation());
    navigate(`/app/content/${id}`);
  }, [dispatch, navigate, clearStream]);

  const handleNew = useCallback(() => {
    clearStream(); lastDoneRef.current = null; lastTitleRef.current = null;
    dispatch(clearActiveConversation());
    if (isChat) {
      navigate('/app/chat');
    } else {
      navigate('/app/content');
    }
  }, [dispatch, navigate, clearStream, isChat]);

  const handleDelete = useCallback(async (id: string) => {
    await dispatch(deleteConversation(id));
    if (convId === id) navigate('/app/content', { replace: true });
  }, [dispatch, convId, navigate]);

  const handleRename = useCallback((id: string, title: string) => {
    dispatch(updateConversation({ id, title }));
  }, [dispatch]);

  const handleTogglePin = useCallback((id: string, isPinned: boolean) => {
    dispatch(updateConversation({ id, isPinned }));
  }, [dispatch]);

  const handleGenerateImage = useCallback(async (ideaId: string) => {
    try {
      await dispatch(generateImage({ ideaId, provider: selectedProvider })).unwrap();
      toast.success('Image generation started');
    } catch (err) {
      const error = err as { message?: string };
      toast.error(error.message ?? 'Failed to start image generation');
    }
  }, [dispatch, selectedProvider]);

  const messages = activeConversation?.messages ?? [];
  const hasMessages = messages.length > 0 || showStreamingBubble;

  // Ideas from API (persisted in ideas table), filtered to current conversation
  const { ideas: allApiIdeas } = useAppSelector((s) => s.content);
  const apiIdeas = convId ? allApiIdeas.filter((i) => i.conversationId === convId) : [];
  const seenIds = new Set(apiIdeas.map((i) => i.id));
  const allIdeas = [...apiIdeas, ...streamedIdeas.filter((i) => !seenIds.has(i.id))];

  // ---- Loading state while conversation type is unknown ----
  if (isLoadingConv) {
    return (
      <div className="flex -m-6 items-center justify-center" style={{ height: 'calc(100% + 3rem)' }}>
        <Skeleton className="h-8 w-48 rounded-lg" />
      </div>
    );
  }

  // ---- Chat-type conversation view ----
  if (isChat) {
    return (
      <div className="flex -m-6" style={{ height: 'calc(100% + 3rem)' }}>
        <Meta title={activeConversation?.title ? `${activeConversation.title} — Chat` : 'Chat'} />

        {/* Sidebar */}
        <div className="w-[260px] shrink-0 border-r bg-muted/30 p-3 overflow-y-auto">
          <ConversationSidebar
            conversations={sidebarConversations}
            activeId={convId}
            type="chat"
            onSelect={handleSelect}
            onNew={handleNew}
            onDelete={handleDelete}
            onRename={handleRename}
            onTogglePin={handleTogglePin}
          />
        </div>

        {/* Main chat area */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Conversation title bar */}
          {activeConversation && activeConversation.id !== '__draft__' && (
            <div className="flex h-12 items-center border-b px-6">
              <h2 className="text-sm font-medium truncate text-muted-foreground">
                {activeConversation.title ?? 'New conversation'}
              </h2>
            </div>
          )}

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="mx-auto max-w-3xl space-y-6 p-6">
                <Skeleton className="h-10 w-2/3 ml-auto rounded-2xl" />
                <Skeleton className="h-24 w-3/4 rounded-2xl" />
                <Skeleton className="h-10 w-1/2 ml-auto rounded-2xl" />
              </div>
            ) : !hasMessages ? (
              <ChatWelcome />
            ) : (
              <div className="mx-auto max-w-3xl space-y-5 p-6">
                {messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)}
                {showStreamingBubble && <StreamingBubble segments={segments} />}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <ChatInput
            value={message}
            onChange={setMessage}
            onSend={handleSend}
            disabled={isStreaming}
            sending={sending}
            placeholder={hasMessages ? 'Reply...' : 'Ask anything...'}
          />
        </div>
      </div>
    );
  }

  // ---- Content-type conversation view ----
  return (
    <div className="flex -m-6" style={{ height: 'calc(100% + 3rem)' }}>
      <Meta title={activeConversation?.title ? `${activeConversation.title} — Content` : 'Content'} />

      {/* Sidebar */}
      <div className="w-[260px] shrink-0 border-r bg-muted/30 p-3 overflow-y-auto">
        <ConversationSidebar
          conversations={sidebarConversations}
          activeId={convId}
          type="content"
          onSelect={handleSelect}
          onNew={handleNew}
          onDelete={handleDelete}
          onRename={handleRename}
          onTogglePin={handleTogglePin}
        />
      </div>

      {/* Main area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Tabs header */}
        <div className="flex items-center border-b px-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
            <TabsList className="h-11 bg-transparent p-0 gap-0">
              <TabsTrigger value="brainstorm" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs px-4">
                <Lightbulb className="mr-1.5 h-3.5 w-3.5" />Brainstorm
              </TabsTrigger>
              <TabsTrigger value="photos" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs px-4">
                <ImageIcon className="mr-1.5 h-3.5 w-3.5" />Photo Generation
              </TabsTrigger>
              <TabsTrigger value="video" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs px-4">
                <Video className="mr-1.5 h-3.5 w-3.5" />Video
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {activeConversation && activeConversation.id !== '__draft__' && activeTab === 'brainstorm' && (
            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
              {activeConversation.title ?? 'Untitled'}
            </p>
          )}
        </div>

        {/* ==================== BRAINSTORM TAB ==================== */}
        {activeTab === 'brainstorm' && (
          <div className="flex flex-1 flex-col min-h-0">
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="mx-auto max-w-3xl space-y-6 p-6">
                  <Skeleton className="h-10 w-2/3 ml-auto rounded-2xl" />
                  <Skeleton className="h-24 w-3/4 rounded-2xl" />
                </div>
              ) : !hasMessages ? (
                <ContentWelcome />
              ) : (
                <div className="mx-auto max-w-3xl p-6 space-y-5">
                  {messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)}
                  {showStreamingBubble && <StreamingBubble segments={segments} />}

                  {allIdeas.length > 0 && !isStreaming && (
                    <div className="rounded-xl border bg-card p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Lightbulb className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold">Ideas ({allIdeas.length})</h3>
                        <p className="text-[10px] text-muted-foreground ml-auto">Ask the AI to add, remove, or edit ideas</p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {allIdeas.map((idea) => (
                          <IdeaCard key={idea.id} idea={idea} />
                        ))}
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            <ChatInput
              value={message}
              onChange={setMessage}
              onSend={handleSend}
              disabled={isStreaming}
              sending={sending}
              placeholder={hasMessages ? 'Add more ideas, refine, or ask to edit...' : 'Describe what content ideas you need...'}
            />
          </div>
        )}

        {/* ==================== PHOTO GENERATION TAB ==================== */}
        {activeTab === 'photos' && (
          <div className="flex-1 overflow-y-auto p-6">
            <PhotoGenerationTab
              selectedProvider={selectedProvider}
              setSelectedProvider={setSelectedProvider}
              providers={providers}
              generatingImage={generatingImage}
              onGenerate={handleGenerateImage}
            />
          </div>
        )}

        {/* ==================== VIDEO TAB ==================== */}
        {activeTab === 'video' && (
          <div className="flex flex-1 items-center justify-center flex-col gap-2">
            <EmptyState
              icon={Video}
              title="Video Generation — Coming Soon"
              description="AI-powered video generation is on the roadmap."
            />
            <Badge variant="secondary" className="text-xs font-semibold uppercase tracking-widest">
              <Clock className="mr-1.5 h-3 w-3" />
              Coming Soon
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Photo Generation Tab ----

function PhotoGenerationTab({
  selectedProvider, setSelectedProvider, providers, generatingImage, onGenerate,
}: {
  selectedProvider: string;
  setSelectedProvider: (v: string) => void;
  providers: Array<{ name: string; displayName: string }>;
  generatingImage: boolean;
  onGenerate: (ideaId: string) => void;
}) {
  const dispatch = useAppDispatch();
  const { ideas } = useAppSelector((s) => s.content);

  useEffect(() => { dispatch(fetchIdeas()); }, [dispatch]);

  if (ideas.length === 0) {
    return (
      <EmptyState
        icon={ImageIcon}
        title="No ideas yet"
        description="Brainstorm some content ideas first, then come back here to generate images for them."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Image Generation Settings</CardTitle></CardHeader>
        <CardContent className="pb-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Provider</label>
            <Select value={selectedProvider} onValueChange={setSelectedProvider}>
              <SelectTrigger className="w-[200px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.name} value={p.name} className="text-xs">{p.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <h3 className="text-sm font-semibold">Select an idea to generate images</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ideas.map((idea) => (
          <Card key={idea.id} className="group transition-all hover:border-primary/30">
            <CardContent className="p-4">
              <h4 className="text-sm font-semibold truncate">{idea.title}</h4>
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{idea.description}</p>
              {idea.category && (
                <Badge variant="secondary" className="mt-2 text-[10px]">{CATEGORY_LABELS[idea.category] ?? idea.category}</Badge>
              )}
              <div className="mt-3">
                <Button size="sm" className="text-xs" onClick={() => onGenerate(idea.id)} disabled={generatingImage}>
                  {generatingImage ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Wand2 className="mr-1.5 h-3 w-3" />}
                  Generate Image
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
