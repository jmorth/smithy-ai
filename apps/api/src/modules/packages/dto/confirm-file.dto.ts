import { IsString, IsNotEmpty, IsInt, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class ConfirmFileDto {
  @IsString()
  @IsNotEmpty({ message: 'fileKey must not be empty' })
  fileKey!: string;

  @IsString()
  @IsNotEmpty({ message: 'filename must not be empty' })
  filename!: string;

  @IsString()
  @IsNotEmpty({ message: 'mimeType must not be empty' })
  mimeType!: string;

  @Type(() => Number)
  @IsInt({ message: 'sizeBytes must be an integer' })
  @IsPositive({ message: 'sizeBytes must be a positive number' })
  sizeBytes!: number;
}
