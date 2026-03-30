import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Sparkles, Brain, Search, Globe } from 'lucide-react';
import { Meta } from '@/components/shared/meta';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  fetchConversations,
  createConversationAndSend,
  deleteConversation,
  updateConversation,
  clearActiveConversation,
} from '@/store/conversation.slice';
import { ConversationSidebar } from '@/components/conversation/conversation-sidebar';
import { ChatInput } from '@/components/conversation/chat-input';
import { FullHeightLayout } from '@/components/layout/full-height-layout';

function WelcomeScreen() {
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

export function ChatPage(): React.ReactElement {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { conversations, sending } = useAppSelector((s) => s.conversation);

  const [message, setMessage] = useState('');

  const chatConversations = conversations.filter((c) => c.type === 'chat');

  useEffect(() => { dispatch(fetchConversations('chat')); }, [dispatch]);

  const handleSend = useCallback(async () => {
    const msg = message.trim();
    if (!msg) return;
    setMessage('');

    const result = await dispatch(createConversationAndSend({ type: 'chat', message: msg })).unwrap();
    navigate(`/app/content/${result.conversation.id}`, { replace: true, state: { type: 'chat' } });
  }, [message, dispatch, navigate]);

  const handleSelect = useCallback((id: string) => {
    dispatch(clearActiveConversation());
    navigate(`/app/content/${id}`, { state: { type: 'chat' } });
  }, [dispatch, navigate]);

  const handleNew = useCallback(() => {
    dispatch(clearActiveConversation());
    navigate('/app/chat');
  }, [dispatch, navigate]);

  const handleDelete = useCallback(async (id: string) => {
    await dispatch(deleteConversation(id));
  }, [dispatch]);

  const handleRename = useCallback((id: string, title: string) => {
    dispatch(updateConversation({ id, title }));
  }, [dispatch]);

  const handleTogglePin = useCallback((id: string, isPinned: boolean) => {
    dispatch(updateConversation({ id, isPinned }));
  }, [dispatch]);

  return (
    <FullHeightLayout>
      <Meta title="Chat" />

      {/* Sidebar */}
      <div className="w-[260px] shrink-0 border-r bg-muted/30 p-3 overflow-y-auto">
        <ConversationSidebar
          conversations={chatConversations}
          activeId={undefined}
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
        <div className="flex-1 overflow-y-auto">
          <WelcomeScreen />
        </div>

        {/* Input */}
        <ChatInput
          value={message}
          onChange={setMessage}
          onSend={handleSend}
          disabled={sending}
          sending={sending}
          placeholder="Ask anything..."
        />
      </div>
    </FullHeightLayout>
  );
}
