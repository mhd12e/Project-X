import { useEffect, useRef } from 'react';
import { Bot } from 'lucide-react';
import { StreamingSegmentList } from './segment-list';
import type { StreamSegment } from '@/hooks/use-conversation-stream';

export function StreamingBubble({ segments }: { segments: StreamSegment[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [segments]);

  return (
    <div className="flex items-start gap-2.5 max-w-[80%]">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
        <Bot className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1 space-y-0.5 text-sm leading-relaxed">
        {segments.length > 0 ? (
          <StreamingSegmentList segments={segments} />
        ) : (
          <div className="flex items-center gap-1.5 py-1">
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
