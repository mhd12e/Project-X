import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import {
  ActivityLog,
  ActivityCategory,
  ActivityLevel,
} from './activity-log.entity';
import { ActivityGateway } from './activity.gateway';

export interface CreateActivityDto {
  category: ActivityCategory;
  level?: ActivityLevel;
  action: string;
  description: string;
  metadata?: Record<string, unknown> | null;
  userId?: string | null;
}

export interface ActivityFilter {
  category?: ActivityCategory;
  level?: ActivityLevel;
  action?: string;
  userId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface ActivityStats {
  totalToday: number;
  totalThisWeek: number;
  errorCount: number;
  byCategory: Record<string, number>;
}

export interface TimelinePoint {
  timestamp: string;
  count: number;
}

export interface CategoryCount {
  category: string;
  count: number;
}

@Injectable()
export class ActivityLogService {
  constructor(
    @InjectRepository(ActivityLog)
    private readonly repo: Repository<ActivityLog>,
    private readonly gateway: ActivityGateway,
  ) {}

  async log(dto: CreateActivityDto): Promise<ActivityLog> {
    const entry = this.repo.create({
      category: dto.category,
      level: dto.level ?? ActivityLevel.INFO,
      action: dto.action,
      description: dto.description,
      metadata: dto.metadata ?? null,
      userId: dto.userId ?? null,
    });

    const saved = await this.repo.save(entry);

    // Emit real-time event
    this.gateway.emitActivity({
      id: saved.id,
      category: saved.category,
      level: saved.level,
      action: saved.action,
      description: saved.description,
      metadata: saved.metadata,
      userId: saved.userId,
      createdAt: saved.createdAt.toISOString(),
    });

    return saved;
  }

  async findAll(
    filters: ActivityFilter,
  ): Promise<{ data: ActivityLog[]; total: number }> {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 100);

    const qb = this.repo
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.user', 'user')
      .orderBy('log.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (filters.category) {
      qb.andWhere('log.category = :category', {
        category: filters.category,
      });
    }
    if (filters.level) {
      qb.andWhere('log.level = :level', { level: filters.level });
    }
    if (filters.action) {
      qb.andWhere('log.action LIKE :action', {
        action: `%${filters.action}%`,
      });
    }
    if (filters.userId) {
      qb.andWhere('log.userId = :userId', { userId: filters.userId });
    }
    if (filters.from) {
      qb.andWhere('log.createdAt >= :from', { from: filters.from });
    }
    if (filters.to) {
      qb.andWhere('log.createdAt <= :to', { to: filters.to });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async getStats(): Promise<ActivityStats> {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    const [totalToday, totalThisWeek, errorCount, categoryRows] =
      await Promise.all([
        this.repo.count({
          where: { createdAt: MoreThanOrEqual(todayStart) },
        }),
        this.repo.count({
          where: { createdAt: MoreThanOrEqual(weekStart) },
        }),
        this.repo.count({
          where: {
            level: ActivityLevel.ERROR,
            createdAt: MoreThanOrEqual(weekStart),
          },
        }),
        this.repo
          .createQueryBuilder('log')
          .select('log.category', 'category')
          .addSelect('COUNT(*)', 'count')
          .where('log.createdAt >= :weekStart', { weekStart })
          .groupBy('log.category')
          .getRawMany<{ category: string; count: string }>(),
      ]);

    const byCategory: Record<string, number> = {};
    for (const row of categoryRows) {
      byCategory[row.category] = parseInt(row.count, 10);
    }

    return { totalToday, totalThisWeek, errorCount, byCategory };
  }

  async getTimeline(
    range: 'day' | 'week' | 'month' = 'week',
  ): Promise<TimelinePoint[]> {
    const now = new Date();
    const start = new Date(now);

    let dateFormat: string;
    let stepMs: number;
    let formatBucket: (d: Date) => string;

    if (range === 'day') {
      start.setDate(start.getDate() - 1);
      dateFormat = '%Y-%m-%d %H:00:00';
      stepMs = 60 * 60 * 1000; // 1 hour
      formatBucket = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const h = String(d.getHours()).padStart(2, '0');
        return `${y}-${m}-${day} ${h}:00:00`;
      };
    } else if (range === 'week') {
      start.setDate(start.getDate() - 7);
      dateFormat = '%Y-%m-%d';
      stepMs = 24 * 60 * 60 * 1000; // 1 day
      formatBucket = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };
    } else {
      start.setDate(start.getDate() - 30);
      dateFormat = '%Y-%m-%d';
      stepMs = 24 * 60 * 60 * 1000; // 1 day
      formatBucket = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };
    }

    const rows = await this.repo
      .createQueryBuilder('log')
      .select(`DATE_FORMAT(log.createdAt, '${dateFormat}')`, 'timestamp')
      .addSelect('COUNT(*)', 'count')
      .where('log.createdAt >= :start', { start })
      .groupBy('timestamp')
      .orderBy('timestamp', 'ASC')
      .getRawMany<{ timestamp: string; count: string }>();

    // Build a lookup from DB results
    const countMap = new Map<string, number>();
    for (const r of rows) {
      countMap.set(r.timestamp, parseInt(r.count, 10));
    }

    // Fill in all buckets so the chart shows the full range with zeros
    const result: TimelinePoint[] = [];
    const cursor = new Date(start);
    // Snap to bucket boundary
    if (range === 'day') {
      cursor.setMinutes(0, 0, 0);
    } else {
      cursor.setHours(0, 0, 0, 0);
    }

    while (cursor <= now) {
      const key = formatBucket(cursor);
      result.push({ timestamp: key, count: countMap.get(key) ?? 0 });
      cursor.setTime(cursor.getTime() + stepMs);
    }

    return result;
  }

  async getCategoryBreakdown(
    range: 'day' | 'week' | 'month' = 'week',
  ): Promise<CategoryCount[]> {
    const now = new Date();
    const start = new Date(now);
    if (range === 'day') start.setDate(start.getDate() - 1);
    else if (range === 'week') start.setDate(start.getDate() - 7);
    else start.setDate(start.getDate() - 30);

    const rows = await this.repo
      .createQueryBuilder('log')
      .select('log.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .where('log.createdAt >= :start', { start })
      .groupBy('log.category')
      .getRawMany<{ category: string; count: string }>();

    // Build lookup from DB results
    const countMap = new Map<string, number>();
    for (const r of rows) {
      countMap.set(r.category, parseInt(r.count, 10));
    }

    // Zero-fill all known categories so the chart always shows them all
    const allCategories = Object.values(ActivityCategory);
    return allCategories
      .map((cat) => ({
        category: cat,
        count: countMap.get(cat) ?? 0,
      }))
      .sort((a, b) => b.count - a.count);
  }
}
