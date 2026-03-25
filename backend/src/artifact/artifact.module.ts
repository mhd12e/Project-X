import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Artifact } from './artifact.entity';
import { ArtifactService } from './artifact.service';
import { ArtifactController } from './artifact.controller';
import { ArtifactFileController } from './artifact-file.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Artifact])],
  controllers: [ArtifactController, ArtifactFileController],
  providers: [ArtifactService],
  exports: [ArtifactService],
})
export class ArtifactModule {}
