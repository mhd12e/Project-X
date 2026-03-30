import { useState } from 'react';
import {
  ChevronDown, ChevronRight, Lightbulb, Loader2,
  FileText, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { Markdown } from '@/components/shared/markdown';
import type { StreamSegment } from '@/hooks/use-conversation-stream';
import type { ContentBlock } from '@/types/content-block';

function InlineThinking({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-2">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/15 bg-primary/5 px-2.5 py-1 text-xs text-primary/80 hover:bg-primary/10 hover:text-primary transition-colors"
      >
        <Lightbulb className="h-3 w-3" />
        Thought process
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {open && (
        <div className="mt-1.5 rounded-lg border border-primary/10 bg-primary/[0.03] p-3 text-xs text-muted-foreground italic leading-relaxed whitespace-pre-wrap">
          {content}
        </div>
      )}
    </div>
  );
}

function InlineToolCall({ toolName, description, toolInput, toolResult }: {
  toolName: string;
  description?: string;
  toolInput?: string;
  toolResult?: string;
}) {
  const [open, setOpen] = useState(false);
  const isDone = !!toolResult;
  const hasDetails = toolInput || toolResult;

  return (
    <div className="my-1.5">
      <button
        onClick={() => hasDetails && setOpen(!open)}
        className={`flex w-full items-center gap-2 rounded-lg border bg-muted/30 px-3 py-1.5 text-xs text-left transition-colors ${hasDetails ? 'cursor-pointer hover:bg-muted/50' : 'cursor-default'}`}
      >
        {isDone ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        )}
        <span className="text-muted-foreground flex-1 truncate">{description ?? toolName}</span>
        {isDone && toolResult && !open && (
          <span className="text-[10px] text-muted-foreground/60 truncate max-w-[200px] shrink-0">{toolResult}</span>
        )}
        {hasDetails && (
          open ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/50" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
        )}
      </button>
      {open && (
        <div className="mt-1 rounded-lg border bg-muted/20 text-[11px] overflow-hidden">
          {toolInput && (
            <div className="border-b px-3 py-2">
              <span className="font-medium text-muted-foreground/70 uppercase tracking-wider text-[9px]">Input</span>
              <pre className="mt-1 text-muted-foreground whitespace-pre-wrap break-all max-h-40 overflow-y-auto">{formatToolInput(toolInput)}</pre>
            </div>
          )}
          {toolResult && (
            <div className="px-3 py-2">
              <span className="font-medium text-muted-foreground/70 uppercase tracking-wider text-[9px]">Output</span>
              <pre className="mt-1 text-muted-foreground whitespace-pre-wrap break-all max-h-40 overflow-y-auto">{toolResult}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatToolInput(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function InlineSource({ source }: {
  source: { documentId: string; sourceFile: string; section: string; topic: string; score: number };
}) {
  return (
    <span className="my-0.5 mr-1 inline-flex items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground align-middle">
      <FileText className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate max-w-[160px]">{source.sourceFile}</span>
      <span className="text-muted-foreground/40">{(source.score * 100).toFixed(0)}%</span>
    </span>
  );
}

function InlineError({ text }: { text: string }) {
  return (
    <div className="my-2 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <span>{text}</span>
    </div>
  );
}

/** Render streaming segments (live) */
export function StreamingSegmentList({ segments }: { segments: StreamSegment[] }) {
  return (
    <div>
      {segments.map((seg, i) => {
        if (seg.type === 'text') return <Markdown key={i}>{seg.content}</Markdown>;
        if (seg.type === 'thinking') return <InlineThinking key={i} content={seg.content} />;
        if (seg.type === 'tool_call') return <InlineToolCall key={i} toolName={seg.toolName} description={seg.description} toolInput={seg.toolInput} toolResult={seg.toolResult} />;
        if (seg.type === 'source') return <InlineSource key={i} source={seg.source} />;
        return null;
      })}
    </div>
  );
}

/** Render persisted content blocks (from DB) */
export function ContentBlockList({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div>
      {blocks.map((block, i) => {
        if (block.type === 'text') return <Markdown key={i}>{block.text}</Markdown>;
        if (block.type === 'thinking') return <InlineThinking key={i} content={block.text} />;
        if (block.type === 'tool_call') return <InlineToolCall key={i} toolName={block.toolName} description={block.description} toolInput={block.toolInput} toolResult={block.toolResult} />;
        if (block.type === 'source') return <InlineSource key={i} source={block} />;
        if (block.type === 'idea_generated') return null;
        if (block.type === 'error') return <InlineError key={i} text={block.text} />;
        return null;
      })}
    </div>
  );
}
