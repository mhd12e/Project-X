import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OnboardingGuard } from '../common/guards/onboarding.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { ContentIdeaService } from './content-idea.service';
import { ContentImageService } from './content-image.service';
import { GenerateImageDto } from './dto/generate-image.dto';
import { ArtifactService } from '../artifact/artifact.service';

@ApiTags('content')
@Controller('content')
@UseGuards(JwtAuthGuard, OnboardingGuard)
@ApiBearerAuth()
export class ContentController {
  constructor(
    private readonly ideaService: ContentIdeaService,
    private readonly imageService: ContentImageService,
    private readonly artifactService: ArtifactService,
  ) {}

  @Get('ideas')
  @ApiOperation({ summary: 'List all ideas for current user' })
  async listIdeas(@CurrentUser() user: User) {
    const ideas = await this.ideaService.findByUser(user.id);
    const result = await Promise.all(
      ideas.map(async (idea) => {
        const artifacts = await this.artifactService.findBySourceId(idea.id);
        return {
          id: idea.id,
          conversationId: idea.conversationId,
          title: idea.title,
          description: idea.description,
          category: idea.category,
          createdAt: idea.createdAt,
          imageCount: artifacts.length,
        };
      }),
    );
    return result;
  }

  @Get('ideas/:id')
  @ApiOperation({ summary: 'Get idea with artifacts' })
  async getIdea(@Param('id', ParseUUIDPipe) id: string) {
    const idea = await this.ideaService.findById(id);
    if (!idea) throw new NotFoundException('Idea not found');
    const artifacts = await this.artifactService.findBySourceId(idea.id);
    return {
      id: idea.id,
      conversationId: idea.conversationId,
      title: idea.title,
      description: idea.description,
      category: idea.category,
      createdAt: idea.createdAt,
      images: artifacts.map((a) => ({
        id: a.id,
        provider: (a.metadata as Record<string, unknown>)?.provider ?? 'unknown',
        imageUrl: `/api/artifacts/${a.id}/file`,
        status: ((a.metadata as Record<string, unknown>)?.status as string) ?? (a.filePath ? 'completed' : 'pending'),
        error: ((a.metadata as Record<string, unknown>)?.error as string) ?? null,
        createdAt: a.createdAt,
      })),
    };
  }

  @Patch('ideas/:id')
  @ApiOperation({ summary: 'Update an idea' })
  async updateIdea(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { title?: string; description?: string; category?: string },
  ) {
    const idea = await this.ideaService.update(id, body);
    if (!idea) throw new NotFoundException('Idea not found');
    return { id: idea.id, title: idea.title, description: idea.description, category: idea.category };
  }

  @Delete('ideas/:id')
  @ApiOperation({ summary: 'Delete an idea' })
  async deleteIdea(@Param('id', ParseUUIDPipe) id: string) {
    const deleted = await this.ideaService.delete(id);
    if (!deleted) throw new NotFoundException('Idea not found');
    return { success: true };
  }

  @Post('images/generate')
  @ApiOperation({ summary: 'Generate an image from an idea' })
  async generateImage(@CurrentUser() user: User, @Body() dto: GenerateImageDto) {
    return this.imageService.generateImage(
      dto.ideaId,
      dto.provider ?? 'nano_banana',
      dto.customPrompt,
      user.id,
    );
  }

  @Get('images/providers')
  @ApiOperation({ summary: 'List available image generation providers' })
  listProviders() {
    return this.imageService.listProviders();
  }
}
