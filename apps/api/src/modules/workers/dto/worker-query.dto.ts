import { IsOptional, IsString } from 'class-validator';

export class WorkerQueryDto {
  @IsOptional()
  @IsString({ message: 'name must be a string' })
  name?: string;

  @IsOptional()
  @IsString({ message: 'status must be a string' })
  status?: string;
}
