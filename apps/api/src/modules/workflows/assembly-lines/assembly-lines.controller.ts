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
  Query,
} from '@nestjs/common';
import { AssemblyLinesService } from './assembly-lines.service';
import { PackagesService } from '../../../modules/packages/packages.service';
import { ParseSlugPipe } from '../../workers/parse-slug.pipe';
import { CreateAssemblyLineDto } from './dto/create-assembly-line.dto';
import { UpdateAssemblyLineDto } from './dto/update-assembly-line.dto';
import { SubmitPackageBodyDto } from './dto/submit-package-body.dto';
import { PaginationQueryDto } from '../../packages/dto/pagination-query.dto';

@Controller('assembly-lines')
export class AssemblyLinesController {
  constructor(
    @Inject(AssemblyLinesService) private readonly assemblyLinesService: AssemblyLinesService,
    @Inject(PackagesService) private readonly packagesService: PackagesService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateAssemblyLineDto) {
    return this.assemblyLinesService.create(dto);
  }

  @Get()
  findAll() {
    return this.assemblyLinesService.findAll();
  }

  @Get(':slug')
  findBySlug(@Param('slug', ParseSlugPipe) slug: string) {
    return this.assemblyLinesService.findBySlug(slug);
  }

  @Patch(':slug')
  update(@Param('slug', ParseSlugPipe) slug: string, @Body() dto: UpdateAssemblyLineDto) {
    return this.assemblyLinesService.update(slug, dto);
  }

  @Delete(':slug')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Param('slug', ParseSlugPipe) slug: string) {
    await this.assemblyLinesService.archive(slug);
  }

  @Post(':slug/submit')
  @HttpCode(HttpStatus.CREATED)
  submit(@Param('slug', ParseSlugPipe) slug: string, @Body() dto: SubmitPackageBodyDto) {
    return this.assemblyLinesService.submit(slug, dto);
  }

  @Get(':slug/packages')
  async listPackages(
    @Param('slug', ParseSlugPipe) slug: string,
    @Query() query: PaginationQueryDto,
  ) {
    const line = await this.assemblyLinesService.findBySlug(slug);
    return this.packagesService.findAll({ ...query, assemblyLineId: line.id });
  }
}
