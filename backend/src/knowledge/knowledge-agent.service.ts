import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  query,
  tool,
  createSdkMcpServer,
} from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod/v4';
import * as fs from 'fs';
import * as path from 'path';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeDocument, DocumentStatus } from './knowledge-document.entity';
import { KNOWLEDGE_AGENT_SYSTEM_PROMPT } from './knowledge-agent.prompt';
import { KnowledgeGateway } from './knowledge.gateway';
import { RagIngestionService } from '../retrieval/rag-ingestion.service';
import { ActivityLogService } from '../activity/activity-log.service';
import { ActivityCategory, ActivityLevel } from '../activity/activity-log.entity';

const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

const SESSION_FILE = '/app/uploads/.knowledge-session-id';

@Injectable()
export class KnowledgeAgentService {
  private readonly logger = new Logger(KnowledgeAgentService.name);

  constructor(
    private readonly knowledgeService: KnowledgeService,
    private readonly configService: ConfigService,
    private readonly gateway: KnowledgeGateway,
    private readonly ragIngestion: RagIngestionService,
    private readonly activityLog: ActivityLogService,
  ) {}

  private emit(
    documentId: string,
    type: 'status' | 'tool_call' | 'thinking' | 'text' | 'error' | 'complete',
    message: string,
    detail?: string,
  ): void {
    this.gateway.emitActivity({
      documentId,
      type,
      message,
      detail,
      timestamp: Date.now(),
    });
  }

  async processDocument(document: KnowledgeDocument): Promise<void> {
    this.logger.log(
      `Processing document: ${document.title ?? document.id} (${document.id})`,
    );

    this.emit(document.id, 'status', 'Starting document processing');

    this.activityLog.log({
      category: ActivityCategory.AGENT,
      action: 'knowledge.processing_started',
      description: `Processing document "${document.title ?? document.id}"`,
      metadata: { documentId: document.id, mimeType: document.mimeType },
    }).catch(() => {});

    await this.knowledgeService.updateDocumentStatus(
      document.id,
      DocumentStatus.PROCESSING,
    );

    try {
      const isImage = IMAGE_MIME_TYPES.includes(document.mimeType);

      let fileContent: string | null = null;

      if (!isImage) {
        this.emit(document.id, 'status', 'Extracting file content');

        fileContent = await this.extractFileContent(
          document.filePath,
          document.mimeType,
        );

        this.emit(
          document.id,
          'status',
          'Content extracted, starting AI analysis',
          `${fileContent.length} characters`,
        );
      } else {
        this.emit(
          document.id,
          'status',
          'Image detected — agent will analyze visually',
        );
      }

      const knowledgeSummary =
        await this.knowledgeService.getKnowledgeSummary();

      let prompt: string;

      if (isImage) {
        // For images: tell the agent to read the image file using the Read tool
        // The Agent SDK's Read tool natively supports images (vision)
        const absPath = path.resolve(document.filePath);
        prompt = `${knowledgeSummary}\n\n---\n\nProcess this new document:\n\nType: ${document.mimeType}\nDocument ID: ${document.id}\n\nThis is an IMAGE file. First, use the Read tool to read the image at: ${absPath}\n\nAfter viewing the image, extract ALL information from it:\n- If it contains text (scan, screenshot, whiteboard): extract ALL readable text preserving structure\n- If it contains charts/graphs/diagrams: describe the visualization type, extract data points/labels/values, summarize insights\n- If it contains tables: reproduce the data in structured text\n- If it's a photo/illustration: describe it in detail with any business context\n\nUse content_type "image_text" for OCR/extracted text, or "diagram_text" for chart/diagram/graph insights.\nPreserve all extracted data faithfully. Process ALL visible content.`;
      } else {
        prompt = `${knowledgeSummary}\n\n---\n\nProcess this new document:\n\nType: ${document.mimeType}\nDocument ID: ${document.id}\n\nContent:\n${fileContent}`;
      }

      const mcpServer = this.createMcpServer(document.id);
      const buildOptions = (
        useSession: boolean,
      ): Record<string, unknown> => {
        // For images, the agent needs the Read tool to view the image file
        const tools = isImage ? ['Read'] : ([] as string[]);

        const opts: Record<string, unknown> = {
          systemPrompt: KNOWLEDGE_AGENT_SYSTEM_PROMPT,
          model: this.configService.get<string>(
            'CLAUDE_MODEL',
            'claude-sonnet-4-6',
          ),
          tools,
          mcpServers: { knowledge: mcpServer },
          permissionMode: 'bypassPermissions' as const,
          allowDangerouslySkipPermissions: true,
          cwd: '/app/uploads',
          maxTurns: 30,
        };
        if (useSession) {
          const sessionId = this.loadSessionId();
          if (sessionId) {
            opts.resume = sessionId;
          }
        }
        return opts;
      };

      let newSessionId: string | undefined;
      let resultText = '';

      const runQuery = async (useSession: boolean) => {
        const options = buildOptions(useSession);
        this.emit(
          document.id,
          'status',
          isImage ? 'Agent started, analyzing image' : 'Agent started, analyzing document',
        );

        for await (const message of query({
          prompt,
          options: options as Parameters<typeof query>[0]['options'],
        })) {
          this.handleStreamMessage(document.id, message);

          if (
            message.type === 'system' &&
            message.subtype === 'init' &&
            'session_id' in message
          ) {
            newSessionId = message.session_id as string;
          }

          if ('result' in message) {
            resultText = message.result as string;
          }
        }
      };

      try {
        await runQuery(true);
      } catch (resumeError) {
        this.logger.warn(
          `Session resume failed, retrying fresh: ${resumeError}`,
        );
        this.clearSessionId();
        await runQuery(false);
      }

      if (newSessionId) {
        this.saveSessionId(newSessionId);
      }

      // RAG ingestion — embed chunks and store in Qdrant
      this.emit(document.id, 'status', 'Ingesting into RAG database');
      try {
        const freshDoc =
          await this.knowledgeService.findDocumentById(document.id);
        if (freshDoc && freshDoc.chunks && freshDoc.chunks.length > 0) {
          const result = await this.ragIngestion.ingestDocument(
            freshDoc,
            freshDoc.chunks,
          );
          this.emit(
            document.id,
            'status',
            'RAG ingestion complete',
            `${result.ingested} vectors stored, ${result.failed} failed`,
          );
          this.activityLog.log({
            category: ActivityCategory.RETRIEVAL,
            action: 'rag.ingestion_completed',
            description: `RAG ingestion for "${document.title ?? document.id}": ${result.ingested} vectors stored`,
            metadata: { documentId: document.id, ingested: result.ingested, failed: result.failed },
          }).catch(() => {});
        }
      } catch (ragError) {
        const ragMsg =
          ragError instanceof Error ? ragError.message : String(ragError);
        this.logger.error(`RAG ingestion failed: ${ragMsg}`);
        this.emit(document.id, 'error', 'RAG ingestion failed', ragMsg);
        // Don't fail the whole pipeline — chunks are still in MySQL
      }

      this.emit(document.id, 'complete', 'Processing complete');

      this.activityLog.log({
        category: ActivityCategory.AGENT,
        action: 'knowledge.processing_completed',
        description: `Document "${document.title ?? document.id}" processed successfully`,
        metadata: { documentId: document.id },
      }).catch(() => {});

      this.logger.log(
        `Document processed: ${document.title ?? document.id} — ${resultText.slice(0, 200)}`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown error during processing';
      this.logger.error(`Failed to process document: ${message}`);
      this.emit(document.id, 'error', 'Processing failed', message);
      this.activityLog.log({
        category: ActivityCategory.AGENT,
        level: ActivityLevel.ERROR,
        action: 'knowledge.processing_failed',
        description: `Document "${document.title ?? document.id}" processing failed: ${message}`,
        metadata: { documentId: document.id, error: message },
      }).catch(() => {});
      await this.knowledgeService.updateDocumentStatus(
        document.id,
        DocumentStatus.FAILED,
        message,
      );
    }
  }

  private handleStreamMessage(
    documentId: string,
    message: Record<string, unknown>,
  ): void {
    const type = message.type as string | undefined;
    const subtype = message.subtype as string | undefined;

    if (type === 'assistant') {
      // Agent is producing text output
      const content = message.content as
        | Array<Record<string, unknown>>
        | undefined;
      if (!content) return;

      for (const block of content) {
        if (block.type === 'tool_use') {
          const toolName = block.name as string;
          const input = block.input as Record<string, unknown> | undefined;

          let detail: string | undefined;
          if (toolName === 'store_knowledge_chunk') {
            detail = `Section: ${input?.section ?? '?'} — Topic: ${input?.topic ?? '?'}`;
          } else if (toolName === 'update_document_metadata') {
            detail = `Topics: ${(input?.topics as string[])?.length ?? 0}`;
          } else if (toolName === 'generate_title') {
            detail = `"${input?.title ?? '?'}"`;
          } else if (toolName === 'Read') {
            detail = `Reading: ${input?.file_path ?? '?'}`;
          }

          this.emit(documentId, 'tool_call', `Calling ${toolName}`, detail);
        } else if (block.type === 'thinking') {
          const thinking = block.thinking as string | undefined;
          if (thinking) {
            this.emit(
              documentId,
              'thinking',
              'Thinking',
              thinking.slice(0, 200),
            );
          }
        } else if (block.type === 'text') {
          const text = block.text as string | undefined;
          if (text) {
            this.emit(documentId, 'text', text.slice(0, 300));
          }
        }
      }
    } else if (type === 'system' && subtype === 'init') {
      this.emit(documentId, 'status', 'Agent session initialized');
    }
  }

  private createMcpServer(documentId: string) {
    const knowledgeService = this.knowledgeService;
    const emitFn = this.emit.bind(this);

    const storeChunk = tool(
      'store_knowledge_chunk',
      'Store a single knowledge chunk extracted from the document being processed.',
      {
        content: z
          .string()
          .describe(
            'The text content of this chunk. Preserve original wording.',
          ),
        section: z
          .string()
          .describe('The section heading or label this chunk belongs to.'),
        content_type: z
          .enum(['text', 'table', 'list', 'code', 'data', 'specification', 'image_text', 'diagram_text'])
          .describe('The type of content in this chunk. Use "image_text" for text extracted from images/photos, "diagram_text" for insights extracted from charts/diagrams/graphs.'),
        topic: z.string().describe('The primary topic of this chunk.'),
        order_index: z
          .number()
          .describe(
            'Sequential order within the document, starting from 0.',
          ),
      },
      async (args) => {
        await knowledgeService.createChunk({
          documentId,
          content: args.content,
          section: args.section,
          contentType: args.content_type,
          topic: args.topic,
          orderIndex: args.order_index,
          metadata: { source: documentId },
        });
        emitFn(
          documentId,
          'status',
          `Chunk #${args.order_index} stored`,
          `${args.section} — ${args.topic}`,
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: `Chunk stored (section: ${args.section}, topic: ${args.topic})`,
            },
          ],
        };
      },
    );

    const updateMetadata = tool(
      'update_document_metadata',
      'Update the document with a summary and topics after all chunks have been stored.',
      {
        summary: z
          .string()
          .describe('A concise 2-3 sentence summary of the entire document.'),
        topics: z
          .array(z.string())
          .describe('Array of key topics found in the document.'),
      },
      async (args) => {
        await knowledgeService.updateDocumentMetadata(
          documentId,
          args.summary,
          args.topics,
        );
        emitFn(
          documentId,
          'status',
          'Metadata saved',
          `${args.topics.length} topics`,
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Document metadata updated. Processing complete.',
            },
          ],
        };
      },
    );

    const generateTitle = tool(
      'generate_title',
      'Assign a clean, descriptive title to the document. Call this early in processing to replace the raw filename with a human-readable name.',
      {
        title: z
          .string()
          .describe(
            'A short, descriptive title for the document (e.g. "Q4 2025 Financial Report"). Do not include file extensions.',
          ),
      },
      async (args) => {
        await knowledgeService.updateDocumentTitle(documentId, args.title);
        emitFn(documentId, 'status', 'Title generated', `"${args.title}"`);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Document title set to: "${args.title}"`,
            },
          ],
        };
      },
    );

    const getExisting = tool(
      'get_existing_knowledge',
      'Get a summary of all existing documents and topics in the knowledge base.',
      {},
      async () => {
        const summary = await knowledgeService.getKnowledgeSummary();
        emitFn(documentId, 'status', 'Checked existing knowledge base');
        return {
          content: [{ type: 'text' as const, text: summary }],
        };
      },
    );

    return createSdkMcpServer({
      name: 'knowledge-store',
      tools: [storeChunk, updateMetadata, generateTitle, getExisting],
    });
  }

  private loadSessionId(): string | undefined {
    try {
      if (fs.existsSync(SESSION_FILE)) {
        return fs.readFileSync(SESSION_FILE, 'utf-8').trim();
      }
    } catch {
      // Ignore — start fresh
    }
    return undefined;
  }

  private clearSessionId(): void {
    try {
      if (fs.existsSync(SESSION_FILE)) {
        fs.unlinkSync(SESSION_FILE);
      }
    } catch {
      // Ignore
    }
  }

  private saveSessionId(sessionId: string): void {
    try {
      const dir = path.dirname(SESSION_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(SESSION_FILE, sessionId, 'utf-8');
    } catch (error) {
      this.logger.warn(`Failed to save session ID: ${error}`);
    }
  }

  private async extractFileContent(
    filePath: string,
    mimeType: string,
  ): Promise<string> {
    const fullPath = path.resolve(filePath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${fullPath}`);
    }

    if (mimeType === 'application/pdf') {
      const pdfParse = await import('pdf-parse');
      const buffer = fs.readFileSync(fullPath);
      const data = await pdfParse.default(buffer);
      return data.text;
    }

    // Text-based files: read directly
    return fs.readFileSync(fullPath, 'utf-8');
  }
}
