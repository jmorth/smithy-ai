import { Module } from '@nestjs/common';
import { AssemblyLinesService } from './assembly-lines.service';

@Module({
  providers: [AssemblyLinesService],
  exports: [AssemblyLinesService],
})
export class AssemblyLinesModule {}
