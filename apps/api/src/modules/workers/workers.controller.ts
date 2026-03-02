import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { WorkersService } from './workers.service';
import { ParseSlugPipe } from './parse-slug.pipe';
import { validateWorkerConfig } from './worker-yaml.validator';
import { CreateWorkerDto } from './dto/create-worker.dto';
import { UpdateWorkerDto } from './dto/update-worker.dto';
import { CreateWorkerVersionDto } from './dto/create-worker-version.dto';
import { DeprecateVersionDto } from './dto/deprecate-version.dto';

@Controller('workers')
export class WorkersController {
  constructor(@Inject(WorkersService) private readonly workersService: WorkersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createWorker(@Body() dto: CreateWorkerDto) {
    return this.workersService.createWorker(dto);
  }

  @Get()
  findAll() {
    return this.workersService.findAll();
  }

  @Get(':slug')
  findBySlug(@Param('slug', ParseSlugPipe) slug: string) {
    return this.workersService.findBySlug(slug);
  }

  @Patch(':slug')
  updateWorker(@Param('slug', ParseSlugPipe) slug: string, @Body() dto: UpdateWorkerDto) {
    return this.workersService.updateWorker(slug, dto);
  }

  @Post(':slug/versions')
  @HttpCode(HttpStatus.CREATED)
  async createVersion(@Param('slug', ParseSlugPipe) slug: string, @Body() dto: CreateWorkerVersionDto) {
    validateWorkerConfig(dto.yamlConfig);
    return this.workersService.createVersion(slug, dto);
  }

  @Get(':slug/versions/:version')
  findVersion(
    @Param('slug', ParseSlugPipe) slug: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.workersService.findVersion(slug, version);
  }

  @Patch(':slug/versions/:version')
  deprecateVersion(
    @Param('slug', ParseSlugPipe) slug: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() dto: DeprecateVersionDto,
  ) {
    return this.workersService.deprecateVersion(slug, version);
  }
}
