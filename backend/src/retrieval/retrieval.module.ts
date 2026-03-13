import { Module } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { QdrantService } from './qdrant.service';
import { RagIngestionService } from './rag-ingestion.service';
import { RetrievalService } from './retrieval.service';

@Module({
  providers: [
    EmbeddingService,
    QdrantService,
    RagIngestionService,
    RetrievalService,
  ],
  exports: [
    EmbeddingService,
    QdrantService,
    RagIngestionService,
    RetrievalService,
  ],
})
export class RetrievalModule {}
