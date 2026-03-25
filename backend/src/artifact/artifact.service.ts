import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { stat } from 'fs/promises';
import { join } from 'path';
import { Artifact, ArtifactType, ArtifactSource } from './artifact.entity';

export interface CreateArtifactDto {
  userId?: string;
  name: string;
  description?: string;
  type: ArtifactType;
  source: ArtifactSource;
  mimeType?: string;
  filePath: string;
  fileSize?: number;
  sourceId?: string;
  sourceContext?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class ArtifactService {
  private readonly logger = new Logger(ArtifactService.name);
  private readonly uploadsDir = process.env['UPLOAD_DIR'] ?? '/app/uploads';

  constructor(
    @InjectRepository(Artifact)
    private readonly repo: Repository<Artifact>,
  ) {}

  async create(dto: CreateArtifactDto): Promise<Artifact> {
    // Auto-detect file size if not provided
    let fileSize = dto.fileSize;
    if (!fileSize) {
      try {
        const fullPath = join(this.uploadsDir, dto.filePath);
        const stats = await stat(fullPath);
        fileSize = stats.size;
      } catch {
        // File might not exist yet or path issue — skip
      }
    }

    const artifact = this.repo.create({
      userId: dto.userId ?? null,
      name: dto.name,
      description: dto.description ?? null,
      type: dto.type,
      source: dto.source,
      mimeType: dto.mimeType ?? null,
      filePath: dto.filePath,
      fileSize: fileSize ?? null,
      sourceId: dto.sourceId ?? null,
      sourceContext: dto.sourceContext ?? null,
      metadata: dto.metadata ?? null,
    });

    const saved = await this.repo.save(artifact);
    this.logger.log(`Artifact created: ${saved.id} (${saved.type}/${saved.source}) "${saved.name}"`);
    return saved;
  }

  async findAll(filters?: {
    userId?: string;
    type?: ArtifactType;
    source?: ArtifactSource;
    search?: string;
  }): Promise<Artifact[]> {
    const qb = this.repo.createQueryBuilder('a')
      .orderBy('a.createdAt', 'DESC');

    if (filters?.userId) qb.andWhere('a.userId = :userId', { userId: filters.userId });
    if (filters?.type) qb.andWhere('a.type = :type', { type: filters.type });
    if (filters?.source) qb.andWhere('a.source = :source', { source: filters.source });
    if (filters?.search) {
      qb.andWhere('(a.name LIKE :q OR a.description LIKE :q OR a.sourceContext LIKE :q)', {
        q: `%${filters.search}%`,
      });
    }

    return qb.limit(200).getMany();
  }

  async findById(id: string): Promise<Artifact | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findBySourceId(sourceId: string): Promise<Artifact[]> {
    return this.repo.find({ where: { sourceId }, order: { createdAt: 'DESC' } });
  }

  async update(id: string, updates: Partial<Pick<Artifact, 'name' | 'description' | 'filePath' | 'mimeType' | 'fileSize' | 'metadata'>>): Promise<void> {
    await this.repo.update(id, updates as Record<string, unknown>);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  /** Resolve the absolute file path for an artifact */
  getAbsolutePath(artifact: Artifact): string {
    return join(this.uploadsDir, artifact.filePath);
  }

  /** Get summary counts by type */
  async getCounts(userId?: string): Promise<Record<string, number>> {
    const qb = this.repo.createQueryBuilder('a')
      .select('a.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .groupBy('a.type');

    if (userId) qb.where('a.userId = :userId', { userId });

    const rows = await qb.getRawMany<{ type: string; count: string }>();
    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.type] = parseInt(row.count, 10);
    }
    return counts;
  }
}
