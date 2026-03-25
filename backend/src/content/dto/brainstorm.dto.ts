import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BrainstormDto {
  @ApiProperty({ description: 'The brainstorming prompt' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  prompt!: string;

  @ApiPropertyOptional({ description: 'Category filter for ideas' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  category?: string;
}
