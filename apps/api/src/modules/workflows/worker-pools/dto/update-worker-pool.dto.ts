import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  IsUUID,
  IsInt,
  Min,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateWorkerPoolMemberDto {
  @IsUUID()
  workerVersionId!: string;

  @IsOptional()
  @IsNumber()
  @IsInt()
  @Min(1)
  priority?: number;
}

export class UpdateWorkerPoolDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'name must not be empty' })
  @MaxLength(100, { message: 'name must be at most 100 characters' })
  name?: string;

  @IsOptional()
  @IsInt({ message: 'maxConcurrency must be an integer' })
  @Min(1, { message: 'maxConcurrency must be a positive integer' })
  maxConcurrency?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'members must contain at least one member' })
  @ValidateNested({ each: true })
  @Type(() => UpdateWorkerPoolMemberDto)
  members?: UpdateWorkerPoolMemberDto[];
}
