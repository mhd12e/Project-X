import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsObject } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { OnboardingService } from './onboarding.service';

class SaveStepAnswerDto {
  @IsObject()
  answer!: Record<string, unknown>;
}

@ApiTags('onboarding')
@Controller('onboarding')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get current onboarding progress' })
  getStatus(@CurrentUser() user: User) {
    return this.onboardingService.getStatus(user.id);
  }

  @Post('steps/:stepId')
  @ApiOperation({ summary: 'Save answer for an onboarding step' })
  saveStep(
    @CurrentUser() user: User,
    @Param('stepId') stepId: string,
    @Body() dto: SaveStepAnswerDto,
  ) {
    return this.onboardingService.saveStepAnswer(user.id, stepId, dto.answer);
  }
}
