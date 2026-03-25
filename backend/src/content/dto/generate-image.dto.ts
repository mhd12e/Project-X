import { IsString, IsNotEmpty, IsOptional, MaxLength, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateImageDto {
  @ApiProperty({ description: 'The idea to generate an image for' })
  @IsUUID()
  @IsNotEmpty()
  ideaId!: string;

  @ApiPropertyOptional({ description: 'Image provider to use', default: 'nano_banana' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  provider?: string;

  @ApiPropertyOptional({ description: 'Custom prompt override' })
  @IsString()
  @IsOptional()
  @MaxLength(5000)
  customPrompt?: string;
}
