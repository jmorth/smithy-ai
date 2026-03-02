import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

export async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = process.env['PORT'] ?? 3000;
  await app.listen(port);
}

export const startupPromise: Promise<void> = bootstrap();
