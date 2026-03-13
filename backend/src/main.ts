import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const configService = app.get(ConfigService);
  const appMode = configService.get<string>('APP_MODE', 'debug');
  const port = configService.get<number>('API_PORT', 3000);
  const isProduction = appMode === 'production';

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      disableErrorMessages: isProduction,
    }),
  );

  if (isProduction) {
    app.use(helmet());
  } else {
    app.use(helmet({ contentSecurityPolicy: false }));
  }

  app.enableCors({
    origin: isProduction
      ? configService.get<string>('CORS_ORIGIN', 'https://localhost')
      : true,
    credentials: true,
  });

  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Project X API')
      .setDescription('Project X — AI-powered business intelligence platform')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(port);
}

bootstrap();
