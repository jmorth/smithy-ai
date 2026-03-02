import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  IsUUID,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AssemblyLineStepDto {
  @IsUUID()
  workerVersionId!: string;

  @IsOptional()
  @IsObject()
  configOverrides?: Record<string, unknown>;
}

export class CreateAssemblyLineDto {
  @IsString()
  @IsNotEmpty({ message: 'name must not be empty' })
  @MaxLength(100, { message: 'name must be at most 100 characters' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'description must be at most 500 characters' })
  description?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'steps must contain at least one step' })
  @ValidateNested({ each: true })
  @Type(() => AssemblyLineStepDto)
  steps!: AssemblyLineStepDto[];
}
