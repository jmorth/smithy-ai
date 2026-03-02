import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { WorkerPoolsService } from './worker-pools.service';
import { PoolRouterService } from './pool-router.service';
import { ParseSlugPipe } from '../../workers/parse-slug.pipe';
import { CreateWorkerPoolDto } from './dto/create-worker-pool.dto';
import { UpdateWorkerPoolDto } from './dto/update-worker-pool.dto';
import { SubmitPackageBodyDto } from '../assembly-lines/dto/submit-package-body.dto';

@Controller('worker-pools')
export class WorkerPoolsController {
  constructor(
    @Inject(WorkerPoolsService) private readonly workerPoolsService: WorkerPoolsService,
    @Inject(PoolRouterService) private readonly poolRouterService: PoolRouterService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateWorkerPoolDto) {
    return this.workerPoolsService.create(dto);
  }

  @Get()
  async findAll() {
    const pools = await this.workerPoolsService.findAll();
    const activeCounts = await Promise.all(
      pools.map((p) => this.poolRouterService.getActiveCount(p.slug).catch(() => null)),
    );
    return pools.map((p, i) => ({ ...p, activeJobCount: activeCounts[i] }));
  }

  @Get(':slug')
  async findBySlug(@Param('slug', ParseSlugPipe) slug: string) {
    const pool = await this.workerPoolsService.findBySlug(slug);
    const activeJobCount = await this.poolRouterService.getActiveCount(slug).catch(() => null);
    return { ...pool, activeJobCount };
  }

  @Patch(':slug')
  update(@Param('slug', ParseSlugPipe) slug: string, @Body() dto: UpdateWorkerPoolDto) {
    return this.workerPoolsService.update(slug, dto);
  }

  @Delete(':slug')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Param('slug', ParseSlugPipe) slug: string) {
    await this.workerPoolsService.archive(slug);
  }

  @Post(':slug/submit')
  @HttpCode(HttpStatus.CREATED)
  submit(@Param('slug', ParseSlugPipe) slug: string, @Body() dto: SubmitPackageBodyDto) {
    return this.workerPoolsService.submit(slug, dto);
  }
}
