import { IsString, IsOptional, MaxLength, Matches, IsNotEmpty } from 'class-validator';

export class UpdateWorkerDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'name must not be empty' })
  @MaxLength(100, { message: 'name must be at most 100 characters' })
  @Matches(/^[a-zA-Z0-9 _-]+$/, { message: 'name may only contain letters, numbers, spaces, hyphens, and underscores' })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'description must be at most 500 characters' })
  description?: string;
}
