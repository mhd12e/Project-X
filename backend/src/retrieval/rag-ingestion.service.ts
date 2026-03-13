import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EmbeddingService } from './embedding.service';
import {
  QdrantService,
  Quadrant,
  type ChunkPayload,
} from './qdrant.service';
import { KnowledgeChunk } from '../knowledge/knowledge-chunk.entity';
import { KnowledgeDocument } from '../knowledge/knowledge-document.entity';

// Keywords that signal high business importance (Q1)
const Q1_SIGNALS = [
  'revenue', 'profit', 'loss', 'budget', 'forecast', 'strategy',
  'roadmap', 'compliance', 'regulation', 'policy', 'contract',
  'security', 'critical', 'priority', 'kpi', 'objective', 'goal',
  'decision', 'approval', 'executive', 'stakeholder',
];

// Keywords that signal supporting info (Q2)
const Q2_SIGNALS = [
  'process', 'workflow', 'procedure', 'guideline', 'standard',
  'template', 'specification', 'requirement', 'architecture',
  'design', 'implementation', 'integration', 'configuration',
];

// Content types that lean toward reference (Q3)
const Q3_CONTENT_TYPES = ['code', 'data', 'specification', 'table', 'image_text', 'diagram_text'];

@Injectable()
export class RagIngestionService {
  private readonly logger = new Logger(RagIngestionService.name);

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly qdrantService: QdrantService,
  ) {}

  async ingestDocument(
    document: KnowledgeDocument,
    chunks: KnowledgeChunk[],
  ): Promise<{ ingested: number; failed: number }> {
    if (chunks.length === 0) {
      this.logger.warn(`No chunks to ingest for document ${document.id}`);
      return { ingested: 0, failed: 0 };
    }

    this.logger.log(
      `Ingesting ${chunks.length} chunks for "${document.title ?? document.id}" (${document.id})`,
    );

    // Validate and filter out empty chunks
    const validChunks = chunks.filter((c) => c.content?.trim().length > 0);
    if (validChunks.length < chunks.length) {
      this.logger.warn(
        `Skipped ${chunks.length - validChunks.length} empty chunks`,
      );
    }

    // Generate embeddings in batch
    const texts = validChunks.map((c) => c.content);
    let embeddings: number[][];
    try {
      embeddings = await this.embeddingService.embedBatch(texts);
    } catch (error) {
      this.logger.error(`Embedding generation failed: ${error}`);
      return { ingested: 0, failed: validChunks.length };
    }

    // Build payloads with quadrant classification
    const items: Array<{ payload: ChunkPayload; vector: number[] }> = [];
    let failed = 0;

    for (let i = 0; i < validChunks.length; i++) {
      const chunk = validChunks[i];
      const vector = embeddings[i];

      if (!vector) {
        failed++;
        continue;
      }

      const quadrant = this.classifyQuadrant(chunk, document);

      const payload: ChunkPayload = {
        chunk_id: chunk.id,
        document_id: document.id,
        source_file: document.title ?? 'Untitled',
        section_name: chunk.section,
        content_type: chunk.contentType,
        topic: chunk.topic,
        quadrant,
        chunk_text: chunk.content,
        order_index: chunk.orderIndex,
        additional_metadata: {
          ...(chunk.metadata ?? {}),
          mime_type: document.mimeType,
          document_summary: document.summary,
          document_topics: document.topics,
        },
        ingested_at: new Date().toISOString(),
      };

      items.push({ payload, vector });
    }

    // Add document summary as its own searchable vector
    if (document.summary?.trim()) {
      try {
        const [summaryEmbedding] = await this.embeddingService.embedBatch([document.summary]);
        if (summaryEmbedding) {
          const summaryQuadrant = this.classifySummaryQuadrant(document);
          items.push({
            vector: summaryEmbedding,
            payload: {
              chunk_id: randomUUID(),
              document_id: document.id,
              source_file: document.title ?? 'Untitled',
              section_name: 'Document Summary',
              content_type: 'summary',
              topic: (document.topics ?? []).join(', ') || 'general',
              quadrant: summaryQuadrant,
              chunk_text: document.summary,
              order_index: -1,
              additional_metadata: {
                mime_type: document.mimeType,
                document_topics: document.topics,
                is_summary: true,
              },
              ingested_at: new Date().toISOString(),
            },
          });
        }
      } catch (error) {
        this.logger.warn(`Summary embedding failed (non-fatal): ${error}`);
      }
    }

    // Upsert to Qdrant
    try {
      await this.qdrantService.upsertChunks(items);
      this.logger.log(
        `Ingested ${items.length} vectors (${validChunks.length} chunks + summary) into Qdrant for document ${document.id}`,
      );
    } catch (error) {
      this.logger.error(`Qdrant upsert failed: ${error}`);
      return { ingested: 0, failed: validChunks.length };
    }

    return { ingested: items.length, failed };
  }

  async removeDocument(documentId: string): Promise<void> {
    await this.qdrantService.deleteByDocumentId(documentId);
  }

  private classifySummaryQuadrant(document: KnowledgeDocument): Quadrant {
    const text = `${document.summary ?? ''} ${(document.topics ?? []).join(' ')}`.toLowerCase();
    const q1Score = Q1_SIGNALS.filter((s) => text.includes(s)).length;
    if (q1Score >= 1) return Quadrant.Q1;
    const q2Score = Q2_SIGNALS.filter((s) => text.includes(s)).length;
    if (q2Score >= 1) return Quadrant.Q2;
    return Quadrant.Q1; // Summaries are high-level, default to Q1
  }

  private classifyQuadrant(
    chunk: KnowledgeChunk,
    document: KnowledgeDocument,
  ): Quadrant {
    const text = `${chunk.content} ${chunk.topic} ${chunk.section}`.toLowerCase();
    const topics = (document.topics ?? []).map((t) => t.toLowerCase());

    // Q1: Core business knowledge — high importance signals
    const q1Score = Q1_SIGNALS.filter(
      (s) => text.includes(s) || topics.some((t) => t.includes(s)),
    ).length;
    if (q1Score >= 2) return Quadrant.Q1;

    // Q2: Supporting/process information
    const q2Score = Q2_SIGNALS.filter(
      (s) => text.includes(s) || topics.some((t) => t.includes(s)),
    ).length;
    if (q2Score >= 2) return Quadrant.Q2;

    // Q3: Reference/archival — data, code, specs, tables
    if (Q3_CONTENT_TYPES.includes(chunk.contentType)) return Quadrant.Q3;

    // Q4: External/contextual — chunks from web-sourced or supplementary content
    const meta = chunk.metadata ?? {};
    if (meta['source_type'] === 'external' || meta['web_sourced']) {
      return Quadrant.Q4;
    }

    // Default: if it has business keywords → Q1, otherwise Q2
    if (q1Score >= 1) return Quadrant.Q1;
    if (q2Score >= 1) return Quadrant.Q2;

    return Quadrant.Q2;
  }
}
