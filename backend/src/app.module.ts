import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { RetrievalModule } from './retrieval/retrieval.module';
import { ConversationModule } from './conversation/conversation.module';
import { ContentModule } from './content/content.module';
import { ArtifactModule } from './artifact/artifact.module';
import { VaultModule } from './vault/vault.module';
import { ActivityModule } from './activity/activity.module';
import { OnboardingModule } from './onboarding/onboarding.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProduction = config.get('APP_MODE') === 'production';
        return {
          pinoHttp: {
            level: isProduction ? 'info' : 'debug',

            // Don't log health-check polls and static assets
            autoLogging: {
              ignore: (req) => {
                const url = req.url ?? '';
                return (
                  url === '/api/health' ||
                  url === '/api' ||
                  url.startsWith('/socket.io')
                );
              },
            },

            // Compact one-line request log — no headers, no body
            serializers: {
              req: (req) => ({
                method: req.method,
                url: req.url,
              }),
              res: (res) => ({
                statusCode: res.statusCode,
              }),
            },

            // Don't attach full req/res to every log
            quietReqLogger: true,

            transport: isProduction
              ? undefined
              : {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    singleLine: true,
                    translateTime: 'HH:MM:ss',
                    ignore: 'pid,hostname',
                    messageFormat: '{context} | {msg}',
                  },
                },

            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
              ],
              remove: true,
            },
          },
        };
      },
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProd = config.get('APP_MODE') === 'production';
        return {
          type: 'mysql' as const,
          host: config.get<string>('MYSQL_HOST', 'mysql'),
          port: config.get<number>('MYSQL_PORT', 3306),
          username: config.get<string>('MYSQL_USER', 'projectx'),
          password: config.get<string>('MYSQL_PASSWORD'),
          database: config.get<string>('MYSQL_DATABASE', 'projectx'),
          autoLoadEntities: true,
          synchronize: !isProd,
          charset: 'utf8mb4',
          logging: isProd ? ['error'] : ['error', 'warn', 'schema'],
          maxQueryExecutionTime: 1000,
        };
      },
    }),

    ActivityModule,
    UsersModule,
    AuthModule,
    OnboardingModule,
    KnowledgeModule,
    RetrievalModule,
    ConversationModule,
    ContentModule,
    ArtifactModule,
    VaultModule,

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProduction = config.get('APP_MODE') === 'production';
        return {
          throttlers: [
            {
              ttl: 60000,
              limit: isProduction ? 60 : 600,
            },
          ],
        };
      },
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
