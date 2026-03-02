import { IsString, IsNotEmpty, IsOptional, MaxLength, IsIn } from 'class-validator';

export class UpdateAssemblyLineDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'name must not be empty' })
  @MaxLength(100, { message: 'name must be at most 100 characters' })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'description must be at most 500 characters' })
  description?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'PAUSED', 'ARCHIVED'], { message: 'status must be ACTIVE, PAUSED, or ARCHIVED' })
  status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
}
