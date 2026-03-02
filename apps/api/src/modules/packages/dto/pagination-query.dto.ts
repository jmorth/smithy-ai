import { IsString, IsOptional, IsInt, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { PackageStatus } from '@smithy/shared';

export class PaginationQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(100, { message: 'limit must not exceed 100' })
  limit: number = 20;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsEnum(PackageStatus, { message: 'status must be a valid PackageStatus' })
  status?: PackageStatus;
}
