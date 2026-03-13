import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { GravatarService } from '../users/gravatar.service';
import { QdrantService } from '../retrieval/qdrant.service';
import { ActivityLogService } from '../activity/activity-log.service';
import { ActivityCategory, ActivityLevel } from '../activity/activity-log.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user.entity';

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: Omit<User, 'password'> & { avatarUrl?: string | null };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly gravatarService: GravatarService,
    private readonly activityLog: ActivityLogService,
    private readonly dataSource: DataSource,
    private readonly qdrantService: QdrantService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const userCount = await this.usersService.count();
    if (userCount > 0) {
      throw new ForbiddenException(
        'Registration is disabled. An account already exists. Please log in.',
      );
    }

    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);
    const user = await this.usersService.create({
      name: dto.name,
      email: dto.email,
      password: hashedPassword,
      role: UserRole.ADMIN,
    });

    const { password: _, ...userWithoutPassword } = user;
    void _;
    const avatarUrl = await this.gravatarService.getAvatarUrl(user.email);

    this.activityLog.log({
      category: ActivityCategory.AUTH,
      action: 'auth.register',
      description: `User "${user.name}" registered`,
      userId: user.id,
    }).catch(() => {});

    return {
      accessToken: this.generateAccessToken(user),
      refreshToken: this.generateRefreshToken(user),
      user: { ...userWithoutPassword, avatarUrl } as AuthResponse['user'],
    };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.usersService.findByEmailWithPassword(dto.email);
    if (!user) {
      this.activityLog.log({
        category: ActivityCategory.AUTH,
        level: ActivityLevel.WARN,
        action: 'auth.login_failed',
        description: `Failed login attempt for "${dto.email}"`,
      }).catch(() => {});
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      this.activityLog.log({
        category: ActivityCategory.AUTH,
        level: ActivityLevel.WARN,
        action: 'auth.login_failed',
        description: `Invalid password for "${dto.email}"`,
        userId: user.id,
      }).catch(() => {});
      throw new UnauthorizedException('Invalid email or password');
    }

    const { password: _pw, ...userWithoutPassword } = user;
    void _pw;
    const avatarUrl = await this.gravatarService.getAvatarUrl(user.email);

    this.activityLog.log({
      category: ActivityCategory.AUTH,
      action: 'auth.login',
      description: `User "${user.name}" logged in`,
      userId: user.id,
    }).catch(() => {});

    return {
      accessToken: this.generateAccessToken(user),
      refreshToken: this.generateRefreshToken(user),
      user: { ...userWithoutPassword, avatarUrl } as AuthResponse['user'],
    };
  }

  async refresh(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      return {
        accessToken: this.generateAccessToken(user),
        refreshToken: this.generateRefreshToken(user),
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.usersService.findByIdWithPassword(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await this.usersService.updatePassword(userId, hashed);

    this.activityLog.log({
      category: ActivityCategory.AUTH,
      action: 'auth.password_changed',
      description: `User "${user.name}" changed their password`,
      userId: user.id,
    }).catch(() => {});
  }

  async deleteAccountAndReset(
    userId: string,
    password: string,
  ): Promise<void> {
    const user = await this.usersService.findByIdWithPassword(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new BadRequestException('Password is incorrect');
    }

    this.logger.warn(`Platform reset initiated by user "${user.name}" (${user.id})`);

    // Clear all tables in correct order (respecting foreign keys)
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
      await queryRunner.query('TRUNCATE TABLE chat_messages');
      await queryRunner.query('TRUNCATE TABLE chat_conversations');
      await queryRunner.query('TRUNCATE TABLE knowledge_chunks');
      await queryRunner.query('TRUNCATE TABLE knowledge_conversations');
      await queryRunner.query('TRUNCATE TABLE knowledge_documents');
      await queryRunner.query('TRUNCATE TABLE onboarding_answers');
      await queryRunner.query('TRUNCATE TABLE activity_logs');
      await queryRunner.query('TRUNCATE TABLE users');
      await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // Clear Qdrant vectors
    try {
      await this.qdrantService.deleteAllPoints();
    } catch (error) {
      this.logger.error(`Failed to clear Qdrant during reset: ${error}`);
    }

    // Clear uploaded files
    const uploadDir = this.configService.get<string>('UPLOAD_DIR', '/app/uploads');
    try {
      const files = await fs.readdir(uploadDir);
      await Promise.all(
        files.map((f) => fs.unlink(path.join(uploadDir, f)).catch(() => {})),
      );
    } catch {
      // Upload dir may not exist yet
    }

    this.logger.warn('Platform reset complete — all data cleared');
  }

  async getSetupStatus(): Promise<{ needsSetup: boolean }> {
    const count = await this.usersService.count();
    return { needsSetup: count === 0 };
  }

  private generateAccessToken(user: User): string {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
    });
  }

  private generateRefreshToken(user: User): string {
    const expiresIn = this.configService.get<number>(
      'JWT_REFRESH_EXPIRATION_SECONDS',
      604800,
    );
    return this.jwtService.sign(
      { sub: user.id, type: 'refresh' },
      { expiresIn },
    );
  }
}
