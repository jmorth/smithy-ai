import { IsString, IsNotEmpty, MaxLength, Matches } from 'class-validator';

export class PresignFileDto {
  @IsString()
  @IsNotEmpty({ message: 'filename must not be empty' })
  @MaxLength(255, { message: 'filename must not exceed 255 characters' })
  filename!: string;

  @IsString()
  @IsNotEmpty({ message: 'contentType must not be empty' })
  @Matches(/^[\w-]+\/[\w\-.+]+$/, { message: 'contentType must be a valid MIME type' })
  contentType!: string;
}
