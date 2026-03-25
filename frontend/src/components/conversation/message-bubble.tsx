import { Bot, User, AlertCircle } from 'lucide-react';
import { ContentBlockList } from './segment-list';
import type { ConversationMessage } from '@/store/conversation.slice';

export function MessageBubble({ message }: { message: ConversationMessage }) {
  const isUser = message.role === 'user';
  const isError = message.contentBlocks.some((b) => b.type === 'error');

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="flex items-end gap-2.5 max-w-[75%]">
          <div className="rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm">
            <p className="whitespace-pre-wrap leading-relaxed">{message.plainText}</p>
          </div>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <User className="h-3.5 w-3.5 text-primary" />
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-start gap-2.5 max-w-[80%]">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-3.5 w-3.5 text-destructive" />
        </div>
        <div className="rounded-2xl rounded-bl-md border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-sm">
          <ContentBlockList blocks={message.contentBlocks} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5 max-w-[80%]">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
        <Bot className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1 space-y-0.5 text-sm leading-relaxed">
        <ContentBlockList blocks={message.contentBlocks} />
      </div>
    </div>
  );
}
