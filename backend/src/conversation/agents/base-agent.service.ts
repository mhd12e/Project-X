import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { ConversationGateway, type StreamEvent, setActiveGeneration, deleteActiveGeneration } from '../conversation.gateway';
import { ConversationService } from '../conversation.service';
import { ConversationStatus } from '../conversation.entity';
import type { ContentBlock } from '../content-block.types';
import { ActivityLogService } from '../../activity/activity-log.service';
import { ActivityCategory, ActivityLevel } from '../../activity/activity-log.entity';
import { AgentContextService } from '../../common/agent-context.service';

export interface AgentConfig {
  systemPrompt: string;
  mcpServers: Record<string, unknown>;
  builtinTools: string[];
  maxTurns: number;
  cwd: string;
}

/**
 * Base class for AI agent services.
 * Extracts the shared streaming loop that parses Agent SDK events
 * into structured ContentBlocks.
 */
export abstract class BaseAgentService {
  protected abstract readonly logger: Logger;

  constructor(
    protected readonly conversationService: ConversationService,
    protected readonly configService: ConfigService,
    protected readonly gateway: ConversationGateway,
    protected readonly activityLog: ActivityLogService,
    protected readonly agentContext: AgentContextService,
  ) {}

  /** Subclasses define agent-specific config */
  protected abstract getAgentConfig(conversationId: string, blocks: ContentBlock[]): Promise<AgentConfig>;

  /** Called after the agent finishes — subclasses handle domain-specific finalization */
  protected abstract onComplete(
    conversationId: string,
    fullText: string,
  ): Promise<void>;

  /** Activity category for logging */
  protected abstract get activityCategory(): ActivityCategory;

  protected emit(
    conversationId: string,
    type: StreamEvent['type'],
    data: Partial<Omit<StreamEvent, 'conversationId' | 'type' | 'timestamp'>>,
  ): void {
    this.gateway.emit({ conversationId, type, timestamp: Date.now(), ...data });
  }

  async processMessage(conversationId: string, prompt: string, userId?: string): Promise<void> {
    this.logger.log(`Processing message in conversation ${conversationId}`);
    this.emit(conversationId, 'status', { content: 'Thinking...' });

    const gen = { text: '', blocks: [] as ContentBlock[], activities: [] as Array<Record<string, unknown>> };
    setActiveGeneration(conversationId, gen);

    try {
      await this.conversationService.update(conversationId, { status: ConversationStatus.GENERATING });

      const userContext = userId ? await this.agentContext.getContextBlock(userId) : '';

      const conversation = await this.conversationService.findById(conversationId);
      if (!conversation) throw new Error('Conversation not found');

      // Build history context from previous messages
      const historyContext = conversation.messages
        .slice(-20)
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.plainText}`)
        .join('\n\n');

      const promptParts: string[] = [];
      if (userContext) promptParts.push(userContext, '\n---\n');
      if (historyContext) promptParts.push(`Previous conversation:\n${historyContext}`, '\n---\n');
      promptParts.push(`User's new message: ${prompt}`);
      const fullPrompt = promptParts.join('\n');

      let fullText = '';
      let inToolDepth = 0;
      let thinkingBuffer = '';
      let currentToolName = '';
      let currentToolInputBuffer = '';
      let isInToolBlock = false;
      const blocks: ContentBlock[] = [];

      const BUILTIN_TOOLS = new Set(['WebSearch', 'WebFetch', 'Read', 'web_search', 'web_fetch']);
      const pendingTools: Array<{ toolName: string; input?: Record<string, unknown> }> = [];

      const agentConfig = await this.getAgentConfig(conversationId, blocks);

      for await (const message of query({
        prompt: fullPrompt,
        options: {
          systemPrompt: agentConfig.systemPrompt,
          model: this.configService.get<string>('CLAUDE_MODEL', 'claude-sonnet-4-6'),
          tools: agentConfig.builtinTools,
          mcpServers: agentConfig.mcpServers,
          permissionMode: 'bypassPermissions' as const,
          allowDangerouslySkipPermissions: true,
          persistSession: false,
          includePartialMessages: true,
          cwd: agentConfig.cwd,
          maxTurns: agentConfig.maxTurns,
        } as Parameters<typeof query>[0]['options'],
      })) {
        if ((message as Record<string, unknown>).type === 'stream_event') {
          const event = (message as Record<string, unknown>).event as Record<string, unknown>;
          if (!event) continue;
          const eventType = event.type as string;

          // Flush pending tool results when a new API response starts
          if (eventType === 'message_start' && pendingTools.length > 0) {
            for (const pending of pendingTools) {
              const resultMsg = BUILTIN_TOOLS.has(pending.toolName)
                ? BaseAgentService.describeBuiltinResult(pending.toolName, pending.input)
                : 'Completed';
              // Only emit if the block hasn't already been filled by an MCP tool's own emitToolResult
              const block = [...blocks].reverse().find(
                (b) => b.type === 'tool_call' && b.toolName === pending.toolName && !b.toolResult,
              );
              if (block) {
                this.emit(conversationId, 'tool_result', { toolName: pending.toolName, toolResult: resultMsg });
                (block as { toolResult?: string }).toolResult = resultMsg;
              }
            }
            pendingTools.length = 0;
          }

          if (eventType === 'content_block_start') {
            const block = event.content_block as Record<string, unknown> | undefined;
            if (block?.type === 'tool_use') {
              const rawName = block.name as string;
              currentToolName = rawName.replace(/^mcp__[^_]+__/, '');
              currentToolInputBuffer = '';
              isInToolBlock = true;
              inToolDepth++;
            } else if (block?.type === 'thinking') {
              thinkingBuffer = '';
            }
          } else if (eventType === 'content_block_delta') {
            const delta = event.delta as Record<string, unknown> | undefined;
            if (!delta) continue;

            if (delta.type === 'text_delta' && inToolDepth === 0) {
              const text = delta.text as string;
              if (text) {
                fullText += text;
                gen.text = fullText;
                const last = blocks[blocks.length - 1];
                if (last && last.type === 'text') {
                  (last as { text: string }).text += text;
                } else {
                  blocks.push({ type: 'text', text });
                }
                this.emit(conversationId, 'text_delta', { content: text });
              }
            } else if (delta.type === 'thinking_delta') {
              const thinking = delta.thinking as string;
              if (thinking) thinkingBuffer += thinking;
            } else if (delta.type === 'input_json_delta' && isInToolBlock) {
              const partial = delta.partial_json as string;
              if (partial) currentToolInputBuffer += partial;
            }
          } else if (eventType === 'content_block_stop') {
            if (isInToolBlock && inToolDepth > 0) {
              inToolDepth--;
              isInToolBlock = false;

              let parsedInput: Record<string, unknown> | undefined;
              try { if (currentToolInputBuffer) parsedInput = JSON.parse(currentToolInputBuffer); } catch { /* ignore */ }

              const description = BaseAgentService.describeToolCall(currentToolName, parsedInput);
              const inputStr = currentToolInputBuffer || undefined;

              this.emit(conversationId, 'tool_call', { toolName: currentToolName, toolInput: inputStr, description });
              blocks.push({ type: 'tool_call', toolName: currentToolName, toolInput: inputStr, description });
              gen.activities.push({ type: 'tool_call', toolName: currentToolName, toolInput: inputStr, description });

              pendingTools.push({ toolName: currentToolName, input: parsedInput });

              currentToolName = '';
              currentToolInputBuffer = '';
            } else if (inToolDepth > 0) {
              inToolDepth--;
            }

            if (thinkingBuffer) {
              const snippet = thinkingBuffer.slice(0, 500);
              blocks.push({ type: 'thinking', text: snippet });
              this.emit(conversationId, 'thinking', { content: snippet });
              thinkingBuffer = '';
            }
          }
          continue;
        }

        // Final result fallback
        if ('result' in (message as Record<string, unknown>)) {
          const result = (message as Record<string, unknown>).result as string;
          if (!fullText && result) {
            fullText = result;
            this.emit(conversationId, 'text_delta', { content: result });
          }
        }
      }

      // Flush remaining pending tools
      for (const pending of pendingTools) {
        const resultMsg = BUILTIN_TOOLS.has(pending.toolName)
          ? BaseAgentService.describeBuiltinResult(pending.toolName, pending.input)
          : 'Completed';
        const block = [...blocks].reverse().find(
          (b) => b.type === 'tool_call' && b.toolName === pending.toolName && !b.toolResult,
        );
        if (block) {
          this.emit(conversationId, 'tool_result', { toolName: pending.toolName, toolResult: resultMsg });
          (block as { toolResult?: string }).toolResult = resultMsg;
        }
      }

      // Save assistant message with structured blocks
      const savedMsg = await this.conversationService.addMessage(conversationId, 'assistant', blocks);
      await this.conversationService.update(conversationId, { status: ConversationStatus.ACTIVE });

      // Domain-specific finalization
      await this.onComplete(conversationId, fullText);

      deleteActiveGeneration(conversationId);
      this.emit(conversationId, 'done', { messageId: savedMsg.id });

      const toolCount = blocks.filter((b) => b.type === 'tool_call').length;
      this.activityLog.log({
        category: this.activityCategory,
        action: 'response.generated',
        description: `AI response (${toolCount} tool calls, ${fullText.length} chars)`,
        metadata: { conversationId, toolCount, responseLength: fullText.length },
        userId,
      }).catch(() => {});
    } catch (error) {
      deleteActiveGeneration(conversationId);
      await this.conversationService.update(conversationId, { status: ConversationStatus.ACTIVE });
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Agent failed: ${errMsg}`);
      this.emit(conversationId, 'error', { content: errMsg });
      this.activityLog.log({
        category: this.activityCategory,
        level: ActivityLevel.ERROR,
        action: 'response.failed',
        description: `Agent failed: ${errMsg}`,
        metadata: { conversationId, error: errMsg },
        userId,
      }).catch(() => {});
    }
  }

  // ---- Title generation (shared) ----

  protected async generateTitle(conversationId: string, userMessage: string, assistantText: string): Promise<void> {
    try {
      let title = '';
      const prompt = [
        'Based on this conversation, generate a short title (max 50 chars, no quotes, no prefix like "Title:").',
        'Just output the title text, nothing else.',
        '',
        `User: ${userMessage.slice(0, 500)}`,
        `Assistant: ${assistantText.slice(0, 500)}`,
      ].join('\n');

      for await (const message of query({
        prompt,
        options: {
          systemPrompt: 'You generate short, descriptive conversation titles. Output ONLY the title text, max 50 characters. No quotes, no prefix.',
          model: this.configService.get<string>('CLAUDE_MODEL', 'claude-sonnet-4-6'),
          tools: [] as string[],
          permissionMode: 'bypassPermissions' as const,
          allowDangerouslySkipPermissions: true,
          persistSession: false,
          maxTurns: 1,
          cwd: '/app',
        } as Parameters<typeof query>[0]['options'],
      })) {
        if ('result' in (message as Record<string, unknown>)) {
          title = ((message as Record<string, unknown>).result as string).trim();
        }
      }

      if (title) {
        title = title.replace(/^["']|["']$/g, '').slice(0, 60);
        await this.conversationService.update(conversationId, { title });
        this.emit(conversationId, 'title_updated', { content: title });
      }
    } catch {
      const fallback = userMessage.replace(/\n/g, ' ').trim().slice(0, 57);
      const fallbackTitle = fallback.length < userMessage.length ? fallback + '...' : fallback;
      await this.conversationService.update(conversationId, { title: fallbackTitle });
      this.emit(conversationId, 'title_updated', { content: fallbackTitle });
    }
  }

  // ---- Static tool description utilities ----

  static describeToolCall(toolName: string, input?: Record<string, unknown>): string {
    if (toolName === 'search_knowledge') {
      const q = input?.query as string | undefined;
      return q ? `Searching knowledge base for "${q}"` : 'Searching knowledge base';
    }
    if (toolName === 'get_document_info') return 'Looking up document details';
    if (toolName === 'list_documents') return 'Browsing all documents';
    if (toolName === 'save_idea') {
      const t = input?.title as string | undefined;
      return t ? `Saving idea: "${t}"` : 'Saving content idea';
    }
    if (toolName === 'WebSearch' || toolName === 'web_search') {
      const q = input?.query as string | undefined;
      return q ? `Searching the web for "${q}"` : 'Searching the web';
    }
    if (toolName === 'WebFetch' || toolName === 'web_fetch') {
      const url = input?.url as string | undefined;
      if (url) {
        try { return `Fetching ${new URL(url).hostname.replace('www.', '')}`; } catch { return 'Fetching web page'; }
      }
      return 'Fetching web page';
    }
    if (toolName.includes('actor') || toolName.includes('apify') || toolName.startsWith('apify_')) {
      const url = (input?.startUrls as Array<{ url: string }> | undefined)?.[0]?.url ?? (input?.url as string | undefined);
      if (url) { try { return `Scraping ${new URL(url).hostname.replace('www.', '')}`; } catch { return `Scraping ${url.slice(0, 60)}`; } }
      const q = input?.query as string | undefined;
      if (q) return `Searching for "${q}"`;
      const actorId = input?.actorId as string | undefined;
      if (actorId) return `Running ${actorId.split('/').pop()?.replace(/-/g, ' ') ?? actorId}`;
      return toolName.replace(/^(mcp__apify__|apify_)/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }
    const readable = toolName.replace(/^mcp__[^_]+__/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const hint = (input?.query ?? input?.search ?? input?.q ?? input?.url) as string | undefined;
    if (hint && typeof hint === 'string') return `${readable}: "${hint.slice(0, 80)}"`;
    return readable;
  }

  static describeBuiltinResult(toolName: string, input?: Record<string, unknown>): string {
    if (toolName === 'WebSearch' || toolName === 'web_search') {
      const q = input?.query as string | undefined;
      return q ? `Web search completed for "${q}"` : 'Web search completed';
    }
    if (toolName === 'WebFetch' || toolName === 'web_fetch') {
      const url = input?.url as string | undefined;
      if (url) { try { return `Fetched content from ${new URL(url).hostname.replace('www.', '')}`; } catch { return 'Web page fetched'; } }
      return 'Web page fetched';
    }
    if (toolName === 'Read') {
      const filePath = input?.file_path as string | undefined;
      return filePath ? `File read: ${filePath}` : 'File read';
    }
    return 'Completed';
  }
}
