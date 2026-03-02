import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

export async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  app.useGlobalFilters(new HttpExceptionFilter());

  const corsOrigin = process.env['CORS_ORIGIN'] ?? 'http://localhost:5173';
  app.enableCors({ origin: corsOrigin });

  app.setGlobalPrefix('api');

  app.enableShutdownHooks();

  const port = parseInt(process.env['APP_PORT'] ?? '3000', 10);
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`Application is running on port ${port}`, 'Bootstrap');
}

export const startupPromise: Promise<void> = bootstrap();
