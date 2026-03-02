import { Module } from '@nestjs/common';
import { ContainerBuilderService } from './container-builder.service';
import { ContainerManagerService } from './container-manager.service';

@Module({
  providers: [ContainerBuilderService, ContainerManagerService],
  exports: [ContainerBuilderService, ContainerManagerService],
})
export class ContainersModule {}
