import { IsString, IsNotEmpty, IsEnum, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConversationType } from '../conversation.entity';

export class CreateConversationDto {
  @ApiProperty({ enum: ConversationType })
  @IsEnum(ConversationType)
  @IsNotEmpty()
  type!: ConversationType;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(255)
  title?: string;

  /** For content conversations — the initial brainstorm prompt */
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(50000)
  message?: string;
}
