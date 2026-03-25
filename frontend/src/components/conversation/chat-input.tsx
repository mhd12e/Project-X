import { useRef, useEffect } from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  sending?: boolean;
  placeholder?: string;
}

export function ChatInput({ value, onChange, onSend, disabled, sending, placeholder }: ChatInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [value]);

  const canSend = value.trim().length > 0 && !disabled && !sending;

  return (
    <div className="sticky bottom-0 z-10 border-t bg-background/80 backdrop-blur-sm px-4 py-3">
      <div className="mx-auto max-w-3xl">
        <div className="relative flex items-end rounded-xl border bg-card shadow-sm transition-shadow focus-within:shadow-md focus-within:border-primary/30">
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (canSend) onSend();
              }
            }}
            placeholder={placeholder ?? 'Message...'}
            className="w-full resize-none bg-transparent px-4 py-3 pr-12 text-sm leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50"
            disabled={disabled || sending}
            rows={1}
          />
          <div className="absolute bottom-2 right-2">
            <Button
              onClick={onSend}
              disabled={!canSend}
              size="icon"
              className={cn(
                'h-8 w-8 rounded-lg transition-all',
                canSend ? 'opacity-100 scale-100' : 'opacity-40 scale-95',
              )}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground/50">
          AI can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}
