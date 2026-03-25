import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod/v4';
import { BaseAgentService, type AgentConfig } from './base-agent.service';
import { ConversationGateway } from '../conversation.gateway';
import { ConversationService } from '../conversation.service';
import { RetrievalService } from '../../retrieval/retrieval.service';
import { KnowledgeService } from '../../knowledge/knowledge.service';
import { ActivityLogService } from '../../activity/activity-log.service';
import { ActivityCategory } from '../../activity/activity-log.entity';
import { AgentContextService } from '../../common/agent-context.service';
import type { ContentBlock, SourceBlock, ToolCallBlock } from '../content-block.types';

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
- Use Apify tools when the user asks for web scraping, crawling, data extraction from external websites
- Be concise and actionable in your responses
- Use markdown formatting for readability
- When multiple sources are relevant, synthesize them into a coherent answer
- For follow-up questions, use conversation context to refine your searches`;

@Injectable()
export class ChatAgentService extends BaseAgentService {
  protected readonly logger = new Logger(ChatAgentService.name);
  protected get activityCategory(): ActivityCategory { return ActivityCategory.AGENT; }

  constructor(
    conversationService: ConversationService,
    configService: ConfigService,
    gateway: ConversationGateway,
    activityLog: ActivityLogService,
    agentContext: AgentContextService,
    private readonly retrievalService: RetrievalService,
    private readonly knowledgeService: KnowledgeService,
  ) {
    super(conversationService, configService, gateway, activityLog, agentContext);
  }

  protected async getAgentConfig(conversationId: string, blocks: ContentBlock[]): Promise<AgentConfig> {
    const mcpServers: Record<string, unknown> = {
      chat: this.createMcpServer(conversationId, blocks),
    };

    const apifyToken = this.configService.get<string>('APIFY_TOKEN');
    if (apifyToken) {
      mcpServers.apify = {
        command: 'npx',
        args: ['-y', '@apify/actors-mcp-server', '--tools', 'actors,docs,experimental,runs,storage'],
        env: { APIFY_TOKEN: apifyToken },
      };
    }

    return {
      systemPrompt: CHAT_SYSTEM_PROMPT,
      mcpServers,
      builtinTools: ['WebSearch', 'WebFetch'],
      maxTurns: 200,
      cwd: '/app',
    };
  }

  protected async onComplete(conversationId: string, fullText: string): Promise<void> {
    const conversation = await this.conversationService.findById(conversationId);
    if (!conversation) return;

    const msgCount = await this.conversationService.getMessageCount(conversationId);
    if (msgCount === 2 && !conversation.title) {
      const userMsg = conversation.messages.find((m) => m.role === 'user');
      if (userMsg) {
        this.generateTitle(conversationId, userMsg.plainText, fullText).catch((err) => {
          this.logger.warn(`Title generation failed: ${err}`);
        });
      }
    }
  }

  private createMcpServer(conversationId: string, blocksRef: ContentBlock[]) {
    const retrievalService = this.retrievalService;
    const knowledgeService = this.knowledgeService;
    const emitFn = this.emit.bind(this);

    const emitToolResult = (toolName: string, resultText: string) => {
      emitFn(conversationId, 'tool_result', { toolName, toolResult: resultText });
      for (let i = blocksRef.length - 1; i >= 0; i--) {
        const b = blocksRef[i];
        if (b.type === 'tool_call' && b.toolName === toolName && !b.toolResult) {
          (b as ToolCallBlock).toolResult = resultText;
          break;
        }
      }
    };

    const searchKnowledge = tool(
      'search_knowledge',
      'Search the knowledge base for information relevant to the user\'s question.',
      {
        query: z.string().describe('The search query.'),
        limit: z.number().optional().describe('Max results (default 8).'),
        topic: z.string().optional().describe('Filter by topic if known.'),
      },
      async (args) => {
        const results = await retrievalService.search(args.query, {
          limit: args.limit ?? 8,
          topic: args.topic,
          scoreThreshold: 0.25,
        });

        for (const r of results) {
          const src: SourceBlock = {
            type: 'source',
            documentId: r.payload.document_id,
            sourceFile: r.payload.source_file,
            section: r.payload.section_name,
            topic: r.payload.topic,
            score: r.score,
          };
          emitFn(conversationId, 'source', { source: src });
          blocksRef.push(src);
        }

        if (results.length === 0) {
          emitToolResult('search_knowledge', 'No relevant knowledge found.');
          return { content: [{ type: 'text' as const, text: 'No relevant knowledge found.' }] };
        }

        const formatted = results
          .map((r, i) => `[Source ${i + 1}] "${r.payload.source_file}" | ${r.payload.section_name} | Score: ${r.score.toFixed(2)}\n${r.payload.chunk_text}`)
          .join('\n\n---\n\n');

        emitToolResult('search_knowledge', `Found ${results.length} relevant results.`);
        return { content: [{ type: 'text' as const, text: `Found ${results.length} results:\n\n${formatted}` }] };
      },
    );

    const getDocumentInfo = tool(
      'get_document_info',
      'Get detailed information about a specific document.',
      { document_id: z.string().describe('The UUID of the document.') },
      async (args) => {
        const doc = await knowledgeService.findDocumentById(args.document_id);
        if (!doc) { emitToolResult('get_document_info', 'Document not found.'); return { content: [{ type: 'text' as const, text: 'Document not found.' }] }; }
        const info = [`Title: ${doc.title ?? doc.filename}`, `File: ${doc.filename}`, `Type: ${doc.mimeType}`, `Status: ${doc.status}`, `Summary: ${doc.summary ?? 'N/A'}`, `Topics: ${(doc.topics ?? []).join(', ') || 'None'}`, `Chunks: ${doc.chunks?.length ?? 0}`].join('\n');
        emitToolResult('get_document_info', `Retrieved info for "${doc.title ?? doc.filename}".`);
        return { content: [{ type: 'text' as const, text: info }] };
      },
    );

    const listDocuments = tool(
      'list_documents',
      'List all documents in the knowledge base.',
      {},
      async () => {
        const summary = await knowledgeService.getKnowledgeSummary();
        emitToolResult('list_documents', 'Retrieved knowledge base overview.');
        return { content: [{ type: 'text' as const, text: summary }] };
      },
    );

    return createSdkMcpServer({ name: 'chat-tools', tools: [searchKnowledge, getDocumentInfo, listDocuments] });
  }
}
