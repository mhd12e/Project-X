import { Injectable, Inject, Logger, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  query,
  tool,
  createSdkMcpServer,
} from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod/v4';
import { ChatService } from './chat.service';
import { ChatGateway, type ChatStreamEvent } from './chat.gateway';
import { RetrievalService } from '../retrieval/retrieval.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { ActivityLogService } from '../activity/activity-log.service';
import { ActivityCategory, ActivityLevel } from '../activity/activity-log.entity';
import { AgentContextService } from '../common/agent-context.service';

const CHAT_SYSTEM_PROMPT = `You are the AI Assistant for Project X, a business intelligence platform.

# Your Capabilities
- Answer user questions using the knowledge base via the search_knowledge tool
- Retrieve specific document information via get_document_info tool
- Browse all available knowledge via list_documents tool
- Provide analysis, summaries, and insights based on stored business knowledge
- Access external data via Apify — web scraping, data extraction, running actors, and storage
- Search the web in real-time for up-to-date information using the WebSearch tool
- Fetch and read web pages using the WebFetch tool

# Guidelines
- ALWAYS search the knowledge base when a question could be answered by stored documents
- Cite your sources: mention the document name and section when using retrieved knowledge
- If no relevant knowledge is found, try searching the web before answering from general knowledge
- Use WebSearch when the user asks about current events, recent data, or anything that may have changed after your training
- Use WebFetch to read specific web pages or URLs the user provides
- Use Apify tools when the user asks for web scraping, crawling, data extraction from external websites, or running Apify actors
- Be concise and actionable in your responses
- Use markdown formatting for readability
- When multiple sources are relevant, synthesize them into a coherent answer
- For follow-up questions, use conversation context to refine your searches`;

@Injectable()
export class ChatAgentService {
  private readonly logger = new Logger(ChatAgentService.name);

  /** Tracks accumulated text for in-flight generations so reconnecting clients can catch up */
  private readonly activeGenerations = new Map<string, { text: string; activities: Array<Record<string, unknown>> }>();

  /** Returns the buffered state for an active generation, or null if not generating */
  getActiveGeneration(conversationId: string): { text: string; activities: Array<Record<string, unknown>> } | null {
    return this.activeGenerations.get(conversationId) ?? null;
  }

  constructor(
    private readonly chatService: ChatService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly gateway: ChatGateway,
    private readonly retrievalService: RetrievalService,
    private readonly knowledgeService: KnowledgeService,
    private readonly activityLog: ActivityLogService,
    private readonly agentContext: AgentContextService,
  ) {}

  private emit(
    conversationId: string,
    type: ChatStreamEvent['type'],
    data: Partial<Omit<ChatStreamEvent, 'conversationId' | 'type' | 'timestamp'>>,
  ): void {
    this.gateway.emit({
      conversationId,
      type,
      timestamp: Date.now(),
      ...data,
    });
  }

  async processMessage(conversationId: string, userMessage: string, userId?: string): Promise<void> {
    this.logger.log(`Processing chat message in conversation ${conversationId}`);

    this.emit(conversationId, 'status', { content: 'Thinking...' });
    this.activeGenerations.set(conversationId, { text: '', activities: [] });

    try {
      // Build conversation context from history
      const conversation = await this.chatService.findConversationById(conversationId);
      if (!conversation) throw new Error('Conversation not found');

      // Resolve userId from conversation if not provided
      const resolvedUserId = userId ?? conversation.userId;

      // Build user context from profile + onboarding answers
      const userContext = resolvedUserId
        ? await this.agentContext.getContextBlock(resolvedUserId)
        : '';

      const historyContext = conversation.messages
        .slice(-20) // Last 20 messages for context
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n');

      const promptParts: string[] = [];
      if (userContext) promptParts.push(userContext, '\n---\n');
      if (historyContext) promptParts.push(`Previous conversation:\n${historyContext}`, '\n---\n');
      promptParts.push(`User's new message: ${userMessage}`);
      const prompt = promptParts.join('\n');

      let fullText = '';
      let inToolDepth = 0;
      let thinkingBuffer = '';
      // Current tool block being accumulated — emit at content_block_stop with parsed input
      let currentToolName = '';
      let currentToolInputBuffer = '';
      let isInToolBlock = false;
      const toolCalls: Array<{ toolName: string; description: string; input?: string }> = [];
      const sources: Array<{ documentId: string; sourceFile: string; section: string; topic: string; score: number }> = [];
      // Built-in tools (handled by Agent SDK internally) — need to emit results when they finish
      const BUILTIN_TOOLS = new Set(['WebSearch', 'WebFetch', 'Read', 'web_search', 'web_fetch']);
      const pendingBuiltinTools: Array<{ toolName: string; input?: Record<string, unknown> }> = [];
      // Ordered segments — mirrors the frontend streaming layout for exact reconstruction
      const segments: Array<Record<string, unknown>> = [];

      const mcpServer = this.createMcpServer(conversationId, sources, segments);

      // Build MCP servers map — always include in-process chat tools
      const mcpServers: Record<string, unknown> = { chat: mcpServer };

      // Add Apify MCP server if token is configured
      const apifyToken = this.configService.get<string>('APIFY_TOKEN');
      if (apifyToken) {
        mcpServers.apify = {
          command: 'npx',
          args: ['-y', '@apify/actors-mcp-server', '--tools', 'actors,docs,experimental,runs,storage'],
          env: { APIFY_TOKEN: apifyToken },
        };
      }

      for await (const message of query({
        prompt,
        options: {
          systemPrompt: CHAT_SYSTEM_PROMPT,
          model: this.configService.get<string>('CLAUDE_MODEL', 'claude-sonnet-4-6'),
          tools: ['WebSearch', 'WebFetch'],
          mcpServers: mcpServers,
          permissionMode: 'bypassPermissions' as const,
          allowDangerouslySkipPermissions: true,
          persistSession: false,
          includePartialMessages: true,
          cwd: '/app',
          maxTurns: 200,
        } as Parameters<typeof query>[0]['options'],
      })) {
        // Real-time stream events (token-level deltas)
        if ((message as Record<string, unknown>).type === 'stream_event') {
          const event = (message as Record<string, unknown>).event as Record<string, unknown>;
          if (!event) continue;

          const eventType = event.type as string;

          // When a new API response starts, all pending built-in tools have completed
          if (eventType === 'message_start' && pendingBuiltinTools.length > 0) {
            for (const pending of pendingBuiltinTools) {
              const resultMsg = ChatAgentService.describeBuiltinResult(pending.toolName, pending.input);
              this.emit(conversationId, 'tool_result', { toolName: pending.toolName, toolResult: resultMsg });
              for (let i = segments.length - 1; i >= 0; i--) {
                if (segments[i].type === 'tool_call' && segments[i].toolName === pending.toolName && !segments[i].toolResult) {
                  segments[i].toolResult = resultMsg;
                  break;
                }
              }
            }
            pendingBuiltinTools.length = 0;
          }

          if (eventType === 'content_block_start') {
            const block = event.content_block as Record<string, unknown> | undefined;
            if (block?.type === 'tool_use') {
              // Strip MCP prefix (e.g. "mcp__chat__search_knowledge" -> "search_knowledge")
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
                const gen = this.activeGenerations.get(conversationId);
                if (gen) gen.text = fullText;
                // Append to last text segment or create new one
                const lastSeg = segments[segments.length - 1];
                if (lastSeg && lastSeg.type === 'text') {
                  lastSeg.content = (lastSeg.content as string) + text;
                } else {
                  segments.push({ type: 'text', content: text });
                }
                this.emit(conversationId, 'text_delta', { content: text });
              }
            } else if (delta.type === 'thinking_delta') {
              const thinking = delta.thinking as string;
              if (thinking) {
                thinkingBuffer += thinking;
              }
            } else if (delta.type === 'input_json_delta' && isInToolBlock) {
              const partial = delta.partial_json as string;
              if (partial) {
                currentToolInputBuffer += partial;
              }
            }
          } else if (eventType === 'content_block_stop') {
            // Emit tool call with parsed input and human-readable description
            if (isInToolBlock && inToolDepth > 0) {
              inToolDepth--;
              isInToolBlock = false;

              let parsedInput: Record<string, unknown> | undefined;
              try {
                if (currentToolInputBuffer) {
                  parsedInput = JSON.parse(currentToolInputBuffer);
                }
              } catch {
                // Input may be incomplete — use raw string
              }

              const description = ChatAgentService.describeToolCall(currentToolName, parsedInput);
              const inputStr = currentToolInputBuffer || undefined;

              this.emit(conversationId, 'tool_call', {
                toolName: currentToolName,
                toolInput: inputStr,
                description,
              });

              const toolInfo = { toolName: currentToolName, description, input: inputStr };
              toolCalls.push(toolInfo);
              segments.push({ type: 'tool_call', toolName: currentToolName, toolInput: inputStr, description });
              const gen = this.activeGenerations.get(conversationId);
              if (gen) gen.activities.push({ type: 'tool_call', toolName: currentToolName, toolInput: inputStr, description });

              // Track built-in tools so we can emit results when the next API response starts
              if (BUILTIN_TOOLS.has(currentToolName)) {
                pendingBuiltinTools.push({ toolName: currentToolName, input: parsedInput });
              }

              currentToolName = '';
              currentToolInputBuffer = '';
            } else if (inToolDepth > 0) {
              inToolDepth--;
            }
            // Emit accumulated thinking as a single event when the block completes
            if (thinkingBuffer) {
              const thinkingSnippet = thinkingBuffer.slice(0, 500);
              segments.push({ type: 'thinking', content: thinkingSnippet });
              this.emit(conversationId, 'thinking', { content: thinkingSnippet });
              thinkingBuffer = '';
            }
          }
          continue;
        }

        // Final result from Agent SDK
        if ('result' in (message as Record<string, unknown>)) {
          const result = (message as Record<string, unknown>).result as string;
          // If streaming didn't capture text (fallback), emit it now
          if (!fullText && result) {
            fullText = result;
            this.emit(conversationId, 'text_delta', { content: result });
          }
        }
      }

      // Flush any remaining pending built-in tools (e.g. if the response ended right after tool use)
      for (const pending of pendingBuiltinTools) {
        const resultMsg = ChatAgentService.describeBuiltinResult(pending.toolName, pending.input);
        this.emit(conversationId, 'tool_result', { toolName: pending.toolName, toolResult: resultMsg });
        for (let i = segments.length - 1; i >= 0; i--) {
          if (segments[i].type === 'tool_call' && segments[i].toolName === pending.toolName && !segments[i].toolResult) {
            segments[i].toolResult = resultMsg;
            break;
          }
        }
      }
      pendingBuiltinTools.length = 0;

      // Save the assistant response with activity metadata + segments for exact UI reconstruction
      const metadata: Record<string, unknown> = {};
      if (toolCalls.length > 0) metadata.toolCalls = toolCalls;
      if (sources.length > 0) metadata.sources = sources;
      if (segments.length > 0) metadata.segments = segments;

      const savedMsg = await this.chatService.addMessage(
        conversationId,
        'assistant',
        fullText,
        Object.keys(metadata).length > 0 ? metadata : undefined,
      );

      // Auto-generate title on first exchange (2 messages = 1 user + 1 assistant)
      const msgCount = await this.chatService.getMessageCount(conversationId);
      if (msgCount === 2 && !conversation.title) {
        this.generateSmartTitle(conversationId, userMessage, fullText).catch((err) => {
          this.logger.warn(`Title generation failed: ${err}`);
        });
      }

      this.activeGenerations.delete(conversationId);
      this.emit(conversationId, 'done', { messageId: savedMsg.id });

      this.activityLog.log({
        category: ActivityCategory.AGENT,
        action: 'chat.response_generated',
        description: `AI response generated (${toolCalls.length} tool calls, ${sources.length} sources)`,
        metadata: { conversationId, toolCount: toolCalls.length, sourceCount: sources.length, responseLength: fullText.length },
      }).catch(() => {});
    } catch (error) {
      this.activeGenerations.delete(conversationId);
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Chat processing failed: ${errMsg}`);
      this.emit(conversationId, 'error', { content: errMsg });
      this.activityLog.log({
        category: ActivityCategory.AGENT,
        level: ActivityLevel.ERROR,
        action: 'chat.response_failed',
        description: `Chat agent failed: ${errMsg}`,
        metadata: { conversationId, error: errMsg },
      }).catch(() => {});
    }
  }

  /** Generate a human-readable description of a tool call from its name and parsed input */
  static describeToolCall(toolName: string, input?: Record<string, unknown>): string {
    // Knowledge base tools
    if (toolName === 'search_knowledge') {
      const q = input?.query as string | undefined;
      return q ? `Searching knowledge base for "${q}"` : 'Searching knowledge base';
    }
    if (toolName === 'get_document_info') {
      return 'Looking up document details';
    }
    if (toolName === 'list_documents') {
      return 'Browsing all documents in knowledge base';
    }

    // Web search/fetch tools
    if (toolName === 'WebSearch' || toolName === 'web_search') {
      const q = input?.query as string | undefined;
      return q ? `Searching the web for "${q}"` : 'Searching the web';
    }
    if (toolName === 'WebFetch' || toolName === 'web_fetch') {
      const url = input?.url as string | undefined;
      if (url) {
        try {
          const hostname = new URL(url).hostname.replace('www.', '');
          return `Fetching ${hostname}`;
        } catch {
          return `Fetching web page`;
        }
      }
      return 'Fetching web page';
    }

    // Apify tools — extract meaningful context from input
    if (toolName.includes('actor') || toolName.includes('apify') || toolName.startsWith('apify_')) {
      const actorId = input?.actorId as string | undefined;
      const url = (input?.startUrls as Array<{ url: string }> | undefined)?.[0]?.url
        ?? (input?.url as string | undefined);
      const query = input?.query as string | undefined;

      // Try to build a descriptive label from input context
      if (url) {
        try {
          const hostname = new URL(url).hostname.replace('www.', '');
          return `Scraping ${hostname}`;
        } catch {
          return `Scraping ${url.slice(0, 60)}`;
        }
      }
      if (query) return `Searching for "${query}"`;
      if (actorId) {
        const shortName = actorId.split('/').pop()?.replace(/-/g, ' ') ?? actorId;
        return `Running ${shortName}`;
      }

      // Fallback: clean up tool name
      const cleaned = toolName
        .replace(/^(mcp__apify__|apify_)/, '')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      return cleaned;
    }

    // Generic fallback — turn snake_case/kebab-case into readable text
    const readable = toolName
      .replace(/^mcp__[^_]+__/, '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

    // If we have input with a query/search/url field, append it
    const hint = (input?.query ?? input?.search ?? input?.q ?? input?.url) as string | undefined;
    if (hint && typeof hint === 'string') {
      return `${readable}: "${hint.slice(0, 80)}"`;
    }

    return readable;
  }

  /** Generate a result description for built-in Agent SDK tools (where we don't have the actual output) */
  static describeBuiltinResult(toolName: string, input?: Record<string, unknown>): string {
    if (toolName === 'WebSearch' || toolName === 'web_search') {
      const q = input?.query as string | undefined;
      return q ? `Web search completed for "${q}"` : 'Web search completed';
    }
    if (toolName === 'WebFetch' || toolName === 'web_fetch') {
      const url = input?.url as string | undefined;
      if (url) {
        try {
          const hostname = new URL(url).hostname.replace('www.', '');
          return `Fetched content from ${hostname}`;
        } catch {
          return 'Web page fetched';
        }
      }
      return 'Web page fetched';
    }
    if (toolName === 'Read') {
      const filePath = input?.file_path as string | undefined;
      return filePath ? `File read: ${filePath}` : 'File read';
    }
    return 'Completed';
  }

  private createMcpServer(
    conversationId: string,
    sourcesRef: Array<{ documentId: string; sourceFile: string; section: string; topic: string; score: number }>,
    segmentsRef: Array<Record<string, unknown>>,
  ) {
    const retrievalService = this.retrievalService;
    const knowledgeService = this.knowledgeService;
    const emitFn = this.emit.bind(this);

    /** Emit a tool_result event and update the matching segment in segmentsRef */
    const emitToolResult = (toolName: string, resultText: string) => {
      emitFn(conversationId, 'tool_result', { toolName, toolResult: resultText });
      // Update the last matching tool_call segment with the result
      for (let i = segmentsRef.length - 1; i >= 0; i--) {
        if (segmentsRef[i].type === 'tool_call' && segmentsRef[i].toolName === toolName) {
          segmentsRef[i].toolResult = resultText;
          break;
        }
      }
    };

    const searchKnowledge = tool(
      'search_knowledge',
      'Search the knowledge base for information relevant to the user\'s question. Returns the most semantically similar chunks from all ingested documents.',
      {
        query: z.string().describe('The search query — phrase it as the core question or topic.'),
        limit: z.number().optional().describe('Max results to return (default 8).'),
        topic: z.string().optional().describe('Filter by topic if known.'),
      },
      async (args) => {
        const results = await retrievalService.search(args.query, {
          limit: args.limit ?? 8,
          topic: args.topic,
          scoreThreshold: 0.25,
        });

        // Emit source references for each result and track for metadata
        for (const r of results) {
          const src = {
            documentId: r.payload.document_id,
            sourceFile: r.payload.source_file,
            section: r.payload.section_name,
            topic: r.payload.topic,
            score: r.score,
          };
          emitFn(conversationId, 'source', { source: src });
          sourcesRef.push(src);
          segmentsRef.push({ type: 'source', source: src });
        }

        if (results.length === 0) {
          emitToolResult('search_knowledge', 'No relevant knowledge found.');
          return {
            content: [{ type: 'text' as const, text: 'No relevant knowledge found in the database.' }],
          };
        }

        const formatted = results
          .map(
            (r, i) =>
              `[Source ${i + 1}] Document: "${r.payload.source_file}" | Section: ${r.payload.section_name} | Topic: ${r.payload.topic} | Score: ${r.score.toFixed(2)}\n${r.payload.chunk_text}`,
          )
          .join('\n\n---\n\n');

        emitToolResult('search_knowledge', `Found ${results.length} relevant results from the knowledge base.`);

        return {
          content: [{ type: 'text' as const, text: `Found ${results.length} relevant results:\n\n${formatted}` }],
        };
      },
    );

    const getDocumentInfo = tool(
      'get_document_info',
      'Get detailed information about a specific document including its summary, topics, and chunks.',
      {
        document_id: z.string().describe('The UUID of the document to look up.'),
      },
      async (args) => {
        const doc = await knowledgeService.findDocumentById(args.document_id);
        if (!doc) {
          emitToolResult('get_document_info', 'Document not found.');
          return { content: [{ type: 'text' as const, text: 'Document not found.' }] };
        }

        const info = [
          `Title: ${doc.title ?? doc.filename}`,
          `File: ${doc.filename}`,
          `Type: ${doc.mimeType}`,
          `Status: ${doc.status}`,
          `Summary: ${doc.summary ?? 'No summary available'}`,
          `Topics: ${(doc.topics ?? []).join(', ') || 'None'}`,
          `Chunks: ${doc.chunks?.length ?? 0}`,
        ].join('\n');

        emitToolResult('get_document_info', `Retrieved info for "${doc.title ?? doc.filename}".`);
        return { content: [{ type: 'text' as const, text: info }] };
      },
    );

    const listDocuments = tool(
      'list_documents',
      'List all documents in the knowledge base with their summaries and topics.',
      {},
      async () => {
        const summary = await knowledgeService.getKnowledgeSummary();
        emitToolResult('list_documents', 'Retrieved knowledge base overview.');
        return { content: [{ type: 'text' as const, text: summary }] };
      },
    );

    return createSdkMcpServer({
      name: 'chat-tools',
      tools: [searchKnowledge, getDocumentInfo, listDocuments],
    });
  }

  /**
   * Use the Agent SDK to generate a concise, descriptive conversation title
   * based on the user's first message and the AI's response.
   */
  private async generateSmartTitle(
    conversationId: string,
    userMessage: string,
    assistantResponse: string,
  ): Promise<void> {
    try {
      let title = '';
      const titlePrompt = [
        'Based on this conversation, generate a short title (max 50 chars, no quotes, no prefix like "Title:").',
        'Just output the title text, nothing else.',
        '',
        `User: ${userMessage.slice(0, 500)}`,
        `Assistant: ${assistantResponse.slice(0, 500)}`,
      ].join('\n');

      for await (const message of query({
        prompt: titlePrompt,
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
        // Clean up: remove surrounding quotes if any
        title = title.replace(/^["']|["']$/g, '').slice(0, 60);
        await this.chatService.updateConversationTitle(conversationId, title);
        this.emit(conversationId, 'title_updated', { content: title });
      }
    } catch (err) {
      // Fallback: just use truncated first message
      const fallback = userMessage.replace(/\n/g, ' ').trim().slice(0, 57);
      const fallbackTitle = fallback.length < userMessage.length ? fallback + '...' : fallback;
      await this.chatService.updateConversationTitle(conversationId, fallbackTitle);
      this.emit(conversationId, 'title_updated', { content: fallbackTitle });
    }
  }
}
