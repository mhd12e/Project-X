/**
 * ContentBlock — the atomic unit of message content.
 *
 * Messages are stored as ordered arrays of ContentBlocks.
 * This preserves the exact interleaving of text, tool calls,
 * thinking, sources, and domain-specific blocks (ideas, images).
 *
 * The same types are mirrored on the frontend for type-safe rendering.
 */

export type ContentBlock =
  | TextBlock
  | ToolCallBlock
  | ToolResultBlock
  | ThinkingBlock
  | SourceBlock
  | IdeaGeneratedBlock
  | ImageRequestBlock
  | ErrorBlock;

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolCallBlock {
  type: 'tool_call';
  toolName: string;
  toolInput?: string;
  description?: string;
  toolResult?: string;
}

export interface ToolResultBlock {
  type: 'tool_result';
  toolName: string;
  result: string;
}

export interface ThinkingBlock {
  type: 'thinking';
  text: string;
}

export interface SourceBlock {
  type: 'source';
  documentId: string;
  sourceFile: string;
  section: string;
  topic: string;
  score: number;
}

export interface IdeaGeneratedBlock {
  type: 'idea_generated';
  ideaId: string;
  title: string;
  description: string;
  category?: string;
}

export interface ImageRequestBlock {
  type: 'image_request';
  ideaId: string;
  provider: string;
  artifactId?: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  error?: string;
}

export interface ErrorBlock {
  type: 'error';
  text: string;
}

/** Extract plain text from content blocks for storage/search */
export function extractPlainText(blocks: ContentBlock[]): string {
  return blocks
    .filter((b): b is TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}
