import { describe, it, expect } from 'vitest';
import * as dtos from './index';

describe('Package DTOs barrel export', () => {
  it('exports CreatePackageDto', () => {
    expect(dtos.CreatePackageDto).toBeDefined();
  });

  it('exports UpdatePackageDto', () => {
    expect(dtos.UpdatePackageDto).toBeDefined();
  });

  it('exports PresignFileDto', () => {
    expect(dtos.PresignFileDto).toBeDefined();
  });

  it('exports ConfirmFileDto', () => {
    expect(dtos.ConfirmFileDto).toBeDefined();
  });

  it('exports PaginationQueryDto', () => {
    expect(dtos.PaginationQueryDto).toBeDefined();
  });
});
