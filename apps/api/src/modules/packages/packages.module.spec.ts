import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Global, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PackagesModule } from './packages.module';
import { PackagesController } from './packages.controller';
import { PackagesService } from './packages.service';
import { DRIZZLE } from '../../database/database.constants';
import { StorageService } from '../storage/storage.service';

// A lightweight global stub module that provides the tokens PackagesService needs.
@Global()
@Module({
  providers: [
    { provide: DRIZZLE, useValue: {} },
    { provide: StorageService, useValue: { getPresignedUploadUrl: vi.fn(), delete: vi.fn() } },
  ],
  exports: [DRIZZLE, StorageService],
})
class StubGlobalModule {}

describe('PackagesModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [StubGlobalModule, PackagesModule],
    }).compile();
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should provide PackagesController', () => {
    const controller = module.get<PackagesController>(PackagesController);
    expect(controller).toBeDefined();
  });

  it('should provide PackagesService', () => {
    const service = module.get<PackagesService>(PackagesService);
    expect(service).toBeDefined();
  });

  it('should export PackagesService', () => {
    const exports = Reflect.getMetadata('exports', PackagesModule);
    expect(exports).toContain(PackagesService);
  });
});
