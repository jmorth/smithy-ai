import { Controller, Get, HttpCode, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(200)
  async check(@Res() res: Response): Promise<void> {
    const result = await this.healthService.check();
    const statusCode = result.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(result);
  }
}
