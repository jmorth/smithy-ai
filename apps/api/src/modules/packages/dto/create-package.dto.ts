import { IsString, IsNotEmpty, IsOptional, IsUUID, IsObject } from 'class-validator';

export class CreatePackageDto {
  @IsString()
  @IsNotEmpty({ message: 'type must not be empty' })
  type!: string;

  @IsOptional()
  @IsObject({ message: 'metadata must be an object' })
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsUUID('all', { message: 'assemblyLineId must be a valid UUID' })
  assemblyLineId?: string;
}
