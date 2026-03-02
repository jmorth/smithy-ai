import { IsEnum } from 'class-validator';

export class DeprecateVersionDto {
  @IsEnum(['DEPRECATED'], { message: 'status must be DEPRECATED' })
  status!: 'DEPRECATED';
}
