import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { StorageModule } from './modules/storage/storage.module';
import { PackagesModule } from './modules/packages/packages.module';
import { WorkersModule } from './modules/workers/workers.module';
import { AssemblyLinesModule } from './modules/workflows/assembly-lines/assembly-lines.module';
import { WorkerPoolsModule } from './modules/workflows/worker-pools/worker-pools.module';
import { ContainersModule } from './modules/containers/containers.module';
import { EventsModule } from './modules/events/events.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    EventsModule,
    StorageModule,
    HealthModule,
    PackagesModule,
    WorkersModule,
    AssemblyLinesModule,
    WorkerPoolsModule,
    ContainersModule,
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env['NODE_ENV'] !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        redact: ['req.headers.authorization'],
        autoLogging: {
          ignore: (req) => req.url === '/health',
        },
      },
    }),
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
