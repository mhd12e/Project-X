import { Injectable } from '@nestjs/common';
import { QdrantService, type SearchResult } from './qdrant.service';
import { ActivityLogService } from '../activity/activity-log.service';
import { ActivityCategory } from '../activity/activity-log.entity';

export interface RetrievalOptions {
  limit?: number;
  documentId?: string;
  topic?: string;
  quadrant?: string;
  contentType?: string;
  scoreThreshold?: number;
}

@Injectable()
export class RetrievalService {
  constructor(
    private readonly qdrantService: QdrantService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async search(
    query: string,
    options: RetrievalOptions = {},
  ): Promise<SearchResult[]> {
    const {
      limit = 10,
      documentId,
      topic,
      quadrant,
      contentType,
      scoreThreshold,
    } = options;

    const filter: Record<string, unknown> = {};
    if (documentId) filter['document_id'] = documentId;
    if (topic) filter['topic'] = topic;
    if (quadrant) filter['quadrant'] = quadrant;
    if (contentType) filter['content_type'] = contentType;

    const results = await this.qdrantService.search(query, {
      limit,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
      scoreThreshold,
    });

    this.activityLog.log({
      category: ActivityCategory.RETRIEVAL,
      action: 'search.executed',
      description: `RAG search: "${query.slice(0, 80)}" → ${results.length} results`,
      metadata: { query: query.slice(0, 200), resultCount: results.length, limit, topic, documentId },
    }).catch(() => {});

    return results;
  }
}
