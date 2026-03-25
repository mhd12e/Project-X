import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OnboardingGuard } from '../common/guards/onboarding.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { VaultService } from './vault.service';
import { CredentialTesterService } from './credential-tester.service';
import { CredentialType } from './vault-credential.entity';
import { CREDENTIAL_SCHEMAS } from './credential-schemas';
import { UpsertCredentialDto } from './dto/upsert-credential.dto';

@ApiTags('vault')
@Controller('vault')
@UseGuards(JwtAuthGuard, OnboardingGuard)
@ApiBearerAuth()
export class VaultController {
  constructor(
    private readonly vaultService: VaultService,
    private readonly tester: CredentialTesterService,
  ) {}

  @Get('schemas')
  @ApiOperation({ summary: 'List available credential type schemas' })
  listSchemas() {
    return CREDENTIAL_SCHEMAS;
  }

  @Get('credentials')
  @ApiOperation({ summary: 'List all credentials for current user (masked)' })
  async list(@CurrentUser() user: User) {
    return this.vaultService.findAllForUser(user.id);
  }

  @Put('credentials/:type')
  @ApiOperation({ summary: 'Create or update a credential' })
  async upsert(
    @CurrentUser() user: User,
    @Param('type') type: string,
    @Body() dto: UpsertCredentialDto,
  ) {
    if (!Object.values(CredentialType).includes(type as CredentialType)) {
      throw new BadRequestException(`Unknown credential type: ${type}`);
    }
    return this.vaultService.upsert(
      user.id,
      type as CredentialType,
      dto.data,
      dto.label,
    );
  }

  @Delete('credentials/:type')
  @ApiOperation({ summary: 'Delete a credential' })
  async remove(
    @CurrentUser() user: User,
    @Param('type') type: string,
  ) {
    if (!Object.values(CredentialType).includes(type as CredentialType)) {
      throw new BadRequestException(`Unknown credential type: ${type}`);
    }
    await this.vaultService.delete(user.id, type as CredentialType);
    return { deleted: true };
  }

  @Post('credentials/:type/test')
  @ApiOperation({ summary: 'Test a credential against its provider' })
  async test(
    @CurrentUser() user: User,
    @Param('type') type: string,
  ) {
    if (!Object.values(CredentialType).includes(type as CredentialType)) {
      throw new BadRequestException(`Unknown credential type: ${type}`);
    }
    const credType = type as CredentialType;
    const data = await this.vaultService.getDecrypted(user.id, credType);
    if (!data) {
      return { success: false, message: 'No credential configured for this type.' };
    }

    const result = await this.tester.test(credType, data);
    if (result.success) {
      await this.vaultService.markVerified(user.id, credType);
    }
    return result;
  }
}
