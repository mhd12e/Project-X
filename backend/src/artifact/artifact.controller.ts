import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OnboardingGuard } from '../common/guards/onboarding.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { ArtifactService } from './artifact.service';
import { ArtifactType, ArtifactSource } from './artifact.entity';

@ApiTags('artifacts')
@Controller('artifacts')
@UseGuards(JwtAuthGuard, OnboardingGuard)
@ApiBearerAuth()
export class ArtifactController {
  constructor(private readonly artifactService: ArtifactService) {}

  @Get()
  @ApiOperation({ summary: 'List artifacts with optional filters' })
  async list(
    @CurrentUser() user: User,
    @Query('type') type?: string,
    @Query('source') source?: string,
    @Query('search') search?: string,
  ) {
    const artifacts = await this.artifactService.findAll({
      userId: user.id,
      type: type as ArtifactType | undefined,
      source: source as ArtifactSource | undefined,
      search: search || undefined,
    });

    return artifacts.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      type: a.type,
      source: a.source,
      mimeType: a.mimeType,
      fileSize: a.fileSize ? Number(a.fileSize) : null,
      sourceContext: a.sourceContext,
      createdAt: a.createdAt,
      url: `/api/artifacts/${a.id}/file`,
    }));
  }

  @Get('counts')
  @ApiOperation({ summary: 'Get artifact counts by type' })
  async counts(@CurrentUser() user: User) {
    return this.artifactService.getCounts(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get artifact details' })
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    const artifact = await this.artifactService.findById(id);
    if (!artifact) throw new NotFoundException('Artifact not found');
    return {
      id: artifact.id,
      name: artifact.name,
      description: artifact.description,
      type: artifact.type,
      source: artifact.source,
      mimeType: artifact.mimeType,
      filePath: artifact.filePath,
      fileSize: artifact.fileSize ? Number(artifact.fileSize) : null,
      sourceId: artifact.sourceId,
      sourceContext: artifact.sourceContext,
      metadata: artifact.metadata,
      createdAt: artifact.createdAt,
      url: `/api/artifacts/${artifact.id}/file`,
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an artifact' })
  async deleteOne(@Param('id', ParseUUIDPipe) id: string) {
    const artifact = await this.artifactService.findById(id);
    if (!artifact) throw new NotFoundException('Artifact not found');
    await this.artifactService.delete(id);
    return { deleted: true };
  }
}
