import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Observable, concat, of } from 'rxjs';
import { map, endWith } from 'rxjs/operators';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LogsService } from './logs.service';
import { LogQueryDto } from './dto';

interface MessageEvent {
  data: string | object;
  id?: string;
  type?: string;
  retry?: number;
}

@Controller('jobs/:jobId/logs')
@UseGuards(JwtAuthGuard)
export class LogsController {
  private readonly logger = new Logger(LogsController.name);

  constructor(private readonly logsService: LogsService) {}

  @Get()
  async getLogs(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Query() query: LogQueryDto,
  ) {
    const status = await this.logsService.getJobStatus(jobId);

    if (status === null) {
      throw new NotFoundException(`Job execution not found: ${jobId}`);
    }

    const result = await this.logsService.getLogs(
      jobId,
      {
        level: query.level,
        after: query.after,
        before: query.before,
      },
      {
        page: query.page,
        limit: query.limit,
      },
    );

    return {
      data: result.data,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        jobId,
        jobState: status,
      },
    };
  }

  @Sse('stream')
  streamLogs(
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ): Observable<MessageEvent> {
    // We need to check job status synchronously-ish before returning the observable.
    // NestJS SSE expects a synchronous return of Observable, so we use concat
    // to first validate then stream.
    return new Observable<MessageEvent>((subscriber) => {
      this.validateAndStream(jobId, subscriber);
    });
  }

  private async validateAndStream(
    jobId: string,
    subscriber: import('rxjs').Subscriber<MessageEvent>,
  ): Promise<void> {
    try {
      const status = await this.logsService.getJobStatus(jobId);

      if (status === null) {
        subscriber.error(
          new NotFoundException(`Job execution not found: ${jobId}`),
        );
        return;
      }

      if (this.logsService.isTerminalStatus(status)) {
        subscriber.error(
          new BadRequestException(
            `Job is already ${status.toLowerCase()}. Use GET /api/jobs/${jobId}/logs to retrieve historical logs.`,
          ),
        );
        return;
      }

      this.logger.log(`Starting SSE log stream for job ${jobId}`);

      let isFirst = true;
      const logStream = this.logsService.streamLogs(jobId);
      const subscription = logStream.subscribe({
        next: (entry) => {
          const event: MessageEvent = {
            data: JSON.stringify(entry),
            type: 'log',
          };

          if (isFirst) {
            event.retry = 3000;
            isFirst = false;
          }

          subscriber.next(event);
        },
        complete: () => {
          subscriber.next({
            data: JSON.stringify({ message: 'Job completed' }),
            type: 'complete',
          });
          subscriber.complete();
        },
        error: (err) => {
          subscriber.error(err);
        },
      });

      // Cleanup when the client disconnects
      subscriber.add(() => {
        subscription.unsubscribe();
        this.logger.log(`SSE log stream closed for job ${jobId}`);
      });
    } catch (err) {
      subscriber.error(err);
    }
  }
}
