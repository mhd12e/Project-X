import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';
import { EmbeddingService } from './embedding.service';

export const KNOWLEDGE_COLLECTION = 'knowledge_chunks';

export enum Quadrant {
  Q1 = 'Q1',
  Q2 = 'Q2',
  Q3 = 'Q3',
  Q4 = 'Q4',
}

export interface ChunkPayload {
  chunk_id: string;
  document_id: string;
  source_file: string;
  section_name: string;
  content_type: string;
  topic: string;
  quadrant: Quadrant;
  chunk_text: string;
  order_index: number;
  additional_metadata: Record<string, unknown>;
  ingested_at: string;
}

export interface SearchResult {
  id: string;
  score: number;
  payload: ChunkPayload;
}

@Injectable()
export class QdrantService implements OnModuleInit {
  private readonly logger = new Logger(QdrantService.name);
  private readonly client: QdrantClient;

  constructor(
    private readonly config: ConfigService,
    private readonly embeddingService: EmbeddingService,
  ) {
    this.client = new QdrantClient({
      host: this.config.get<string>('QDRANT_HOST', 'qdrant'),
      port: this.config.get<number>('QDRANT_PORT', 6333),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.ensureCollection();
  }

  private async ensureCollection(): Promise<void> {
    try {
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(
        (c) => c.name === KNOWLEDGE_COLLECTION,
      );

      if (!exists) {
        const dimensions = this.embeddingService.getDimensions();
        await this.client.createCollection(KNOWLEDGE_COLLECTION, {
          vectors: {
            size: dimensions,
            distance: 'Cosine',
          },
        });

        // Create payload indexes for filtering
        await this.client.createPayloadIndex(KNOWLEDGE_COLLECTION, {
          field_name: 'document_id',
          field_schema: 'keyword',
        });
        await this.client.createPayloadIndex(KNOWLEDGE_COLLECTION, {
          field_name: 'topic',
          field_schema: 'keyword',
        });
        await this.client.createPayloadIndex(KNOWLEDGE_COLLECTION, {
          field_name: 'quadrant',
          field_schema: 'keyword',
        });
        await this.client.createPayloadIndex(KNOWLEDGE_COLLECTION, {
          field_name: 'content_type',
          field_schema: 'keyword',
        });

        this.logger.log(
          `Created Qdrant collection "${KNOWLEDGE_COLLECTION}" (${dimensions}d)`,
        );
      } else {
        this.logger.log(
          `Qdrant collection "${KNOWLEDGE_COLLECTION}" already exists`,
        );
      }
    } catch (error) {
      this.logger.error(`Failed to ensure Qdrant collection: ${error}`);
      throw error;
    }
  }

  async upsertChunk(
    payload: ChunkPayload,
    vector: number[],
  ): Promise<void> {
    await this.client.upsert(KNOWLEDGE_COLLECTION, {
      wait: true,
      points: [
        {
          id: payload.chunk_id,
          vector,
          payload: payload as unknown as Record<string, unknown>,
        },
      ],
    });
  }

  async upsertChunks(
    items: Array<{ payload: ChunkPayload; vector: number[] }>,
  ): Promise<void> {
    if (items.length === 0) return;

    const points = items.map((item) => ({
      id: item.payload.chunk_id,
      vector: item.vector,
      payload: item.payload as unknown as Record<string, unknown>,
    }));

    // Qdrant recommends batches of ~100
    const batchSize = 100;
    for (let i = 0; i < points.length; i += batchSize) {
      await this.client.upsert(KNOWLEDGE_COLLECTION, {
        wait: true,
        points: points.slice(i, i + batchSize),
      });
    }
  }

  async search(
    query: string,
    options: {
      limit?: number;
      filter?: Record<string, unknown>;
      scoreThreshold?: number;
    } = {},
  ): Promise<SearchResult[]> {
    const { limit = 10, filter, scoreThreshold = 0.3 } = options;

    const vector = await this.embeddingService.embed(query);

    const results = await this.client.search(KNOWLEDGE_COLLECTION, {
      vector,
      limit,
      score_threshold: scoreThreshold,
      with_payload: true,
      ...(filter ? { filter: { must: this.buildFilter(filter) } } : {}),
    });

    return results.map((r) => ({
      id: r.id as string,
      score: r.score,
      payload: r.payload as unknown as ChunkPayload,
    }));
  }

  async deleteAllPoints(): Promise<void> {
    try {
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(
        (c) => c.name === KNOWLEDGE_COLLECTION,
      );
      if (exists) {
        await this.client.deleteCollection(KNOWLEDGE_COLLECTION);
        this.logger.log(`Deleted Qdrant collection "${KNOWLEDGE_COLLECTION}"`);
        await this.ensureCollection();
      }
    } catch (error) {
      this.logger.error(`Failed to reset Qdrant collection: ${error}`);
      throw error;
    }
  }

  async deleteByDocumentId(documentId: string): Promise<void> {
    await this.client.delete(KNOWLEDGE_COLLECTION, {
      wait: true,
      filter: {
        must: [
          {
            key: 'document_id',
            match: { value: documentId },
          },
        ],
      },
    });
    this.logger.log(`Deleted vectors for document ${documentId}`);
  }

  private buildFilter(
    filter: Record<string, unknown>,
  ): Array<Record<string, unknown>> {
    const conditions: Array<Record<string, unknown>> = [];
    for (const [key, value] of Object.entries(filter)) {
      if (value !== undefined && value !== null) {
        conditions.push({ key, match: { value } });
      }
    }
    return conditions;
  }
}
