import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PackagesService } from './packages.service';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { PresignFileDto } from './dto/presign-file.dto';
import { ConfirmFileDto } from './dto/confirm-file.dto';

@Controller('packages')
export class PackagesController {
  constructor(@Inject(PackagesService) private readonly packagesService: PackagesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreatePackageDto) {
    return this.packagesService.create(dto);
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.packagesService.findAll(query);
  }

  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.packagesService.findById(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePackageDto) {
    return this.packagesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  softDelete(@Param('id', ParseUUIDPipe) id: string) {
    return this.packagesService.softDelete(id);
  }

  @Post(':id/files/presign')
  presignUpload(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PresignFileDto) {
    return this.packagesService.createPresignedUpload(id, dto);
  }

  @Post(':id/files/confirm')
  @HttpCode(HttpStatus.CREATED)
  confirmUpload(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmFileDto) {
    return this.packagesService.confirmFileUpload(id, dto);
  }

  @Get(':id/files')
  listFiles(@Param('id', ParseUUIDPipe) id: string) {
    return this.packagesService.listFiles(id);
  }

  @Delete(':id/files/:fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.packagesService.deleteFile(id, fileId);
  }
}
