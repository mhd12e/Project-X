import { Controller, Post, Get, Patch, Delete, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty, MaxLength, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { GravatarService } from '../users/gravatar.service';

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;
}

class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}

class DeleteAccountDto {
  @IsString()
  @IsNotEmpty()
  password!: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly gravatarService: GravatarService,
  ) {}

  @Get('setup-status')
  @ApiOperation({ summary: 'Check if initial setup (registration) is needed' })
  getSetupStatus() {
    return this.authService.getSetupStatus();
  }

  @Post('register')
  @ApiOperation({ summary: 'Register first user (only works when no users exist)' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email and password' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user' })
  async getMe(@CurrentUser() user: User) {
    const avatarUrl = await this.gravatarService.getAvatarUrl(user.email);
    return { ...user, avatarUrl, onboardingCompleted: user.onboardingCompleted };
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user profile' })
  async updateMe(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
    const updated = dto.name
      ? await this.usersService.updateName(user.id, dto.name)
      : user;
    const avatarUrl = await this.gravatarService.getAvatarUrl(updated.email);
    return { ...updated, avatarUrl };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change current user password' })
  async changePassword(@CurrentUser() user: User, @Body() dto: ChangePasswordDto) {
    await this.authService.changePassword(user.id, dto.currentPassword, dto.newPassword);
    return { message: 'Password changed successfully' };
  }

  @Delete('account')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete account and reset platform to initial state' })
  async deleteAccount(@CurrentUser() user: User, @Body() dto: DeleteAccountDto) {
    await this.authService.deleteAccountAndReset(user.id, dto.password);
    return { message: 'Account deleted and platform reset' };
  }
}
