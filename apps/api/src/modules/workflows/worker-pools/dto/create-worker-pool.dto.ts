import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  IsUUID,
  IsOptional,
  IsInt,
  Min,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

export class WorkerPoolMemberDto {
  @IsUUID()
  workerVersionId!: string;

  @IsOptional()
  @IsNumber()
  @IsInt()
  @Min(1)
  priority?: number;
}

export class CreateWorkerPoolDto {
  @IsString()
  @IsNotEmpty({ message: 'name must not be empty' })
  @MaxLength(100, { message: 'name must be at most 100 characters' })
  name!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'members must contain at least one member' })
  @ValidateNested({ each: true })
  @Type(() => WorkerPoolMemberDto)
  members!: WorkerPoolMemberDto[];

  @IsInt({ message: 'maxConcurrency must be an integer' })
  @Min(1, { message: 'maxConcurrency must be a positive integer' })
  maxConcurrency!: number;
}
