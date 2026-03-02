import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';

export class SubmitPackageBodyDto {
  @IsString()
  @IsNotEmpty({ message: 'type must not be empty' })
  type!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
