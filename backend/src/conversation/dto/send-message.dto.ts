import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({ description: 'The user message' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50000)
  message!: string;
}
