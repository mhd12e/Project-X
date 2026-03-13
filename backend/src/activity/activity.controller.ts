import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OnboardingGuard } from '../common/guards/onboarding.guard';
import { ActivityLogService, type ActivityFilter } from './activity-log.service';
import { ActivityCategory, ActivityLevel } from './activity-log.entity';

@ApiTags('activity')
@Controller('activity')
@UseGuards(JwtAuthGuard, OnboardingGuard)
@ApiBearerAuth()
export class ActivityController {
  constructor(private readonly activityService: ActivityLogService) {}

  @Get()
  @ApiOperation({ summary: 'List activity logs with filters and pagination' })
  findAll(
    @Query('category') category?: ActivityCategory,
    @Query('level') level?: ActivityLevel,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const filters: ActivityFilter = {
      category,
      level,
      action,
      userId,
      from,
      to,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    };
    return this.activityService.findAll(filters);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get activity statistics' })
  getStats() {
    return this.activityService.getStats();
  }

  @Get('timeline')
  @ApiOperation({ summary: 'Get activity timeline for charts' })
  getTimeline(
    @Query('range') range?: 'day' | 'week' | 'month',
  ) {
    return this.activityService.getTimeline(range ?? 'week');
  }

  @Get('categories')
  @ApiOperation({ summary: 'Get activity breakdown by category' })
  getCategoryBreakdown(
    @Query('range') range?: 'day' | 'week' | 'month',
  ) {
    return this.activityService.getCategoryBreakdown(range ?? 'week');
  }
}
