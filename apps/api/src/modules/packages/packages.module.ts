import { Module } from '@nestjs/common';
import { PackagesController } from './packages.controller';
import { PackagesService } from './packages.service';
import { RetentionService } from './retention.service';

@Module({
  controllers: [PackagesController],
  providers: [PackagesService, RetentionService],
  exports: [PackagesService],
})
export class PackagesModule {}
