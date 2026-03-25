import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContentIdea } from './content-idea.entity';
import { ContentIdeaService } from './content-idea.service';

@Module({
  imports: [TypeOrmModule.forFeature([ContentIdea])],
  providers: [ContentIdeaService],
  exports: [ContentIdeaService],
})
export class ContentIdeaModule {}
