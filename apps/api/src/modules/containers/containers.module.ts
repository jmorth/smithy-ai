import { Module } from '@nestjs/common';
import { ContainerBuilderService } from './container-builder.service';

@Module({
  providers: [ContainerBuilderService],
  exports: [ContainerBuilderService],
})
export class ContainersModule {}
