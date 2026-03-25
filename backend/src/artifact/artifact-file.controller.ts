import {
  Controller,
  Get,
  Param,
  Res,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { ArtifactService } from './artifact.service';

@ApiTags('artifacts')
@Controller('artifacts')
export class ArtifactFileController {
  constructor(private readonly artifactService: ArtifactService) {}

  @Get(':id/file')
  @ApiOperation({ summary: 'Serve the artifact file (public, UUID-based)' })
  async serveFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const artifact = await this.artifactService.findById(id);
    if (!artifact) throw new NotFoundException('Artifact not found');

    // Guard: empty filePath means the file was never generated (e.g. generation failed)
    if (!artifact.filePath) {
      throw new NotFoundException('Artifact file not available');
    }

    const absPath = this.artifactService.getAbsolutePath(artifact);

    try {
      const stats = await stat(absPath);
      if (!stats.isFile()) {
        throw new NotFoundException('Artifact path is not a file');
      }
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new NotFoundException('Artifact file not found on disk');
    }

    if (artifact.mimeType) {
      res.setHeader('Content-Type', artifact.mimeType);
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    const stream = createReadStream(absPath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(404).json({ message: 'Failed to read artifact file' });
      }
    });
    stream.pipe(res);
  }
}
