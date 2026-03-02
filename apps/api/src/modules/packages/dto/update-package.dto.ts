import { IsString, IsNotEmpty, IsOptional, IsObject, IsEnum } from 'class-validator';
import { PackageStatus } from '@smithy/shared';

export class UpdatePackageDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'type must not be empty' })
  type?: string;

  @IsOptional()
  @IsObject({ message: 'metadata must be an object' })
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(PackageStatus, { message: 'status must be a valid PackageStatus' })
  status?: PackageStatus;
}
