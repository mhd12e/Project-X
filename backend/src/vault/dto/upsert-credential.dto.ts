import { IsObject, IsNotEmpty, IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertCredentialDto {
  @ApiProperty({ description: 'Credential data matching the type schema' })
  @IsObject()
  @IsNotEmpty()
  data!: Record<string, string>;

  @ApiPropertyOptional({ description: 'User-defined label for this credential' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  label?: string;
}
