import { IsOptional, IsString, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

const VALID_STATUSES = ['PENDING', 'SENT', 'READ'] as const;
const VALID_TYPES = [
  'PACKAGE_CREATED',
  'PACKAGE_PROCESSED',
  'JOB_ERROR',
  'JOB_STUCK',
  'ASSEMBLY_LINE_COMPLETED',
  'ASSEMBLY_LINE_STEP_COMPLETED',
] as const;

export class ListNotificationsQueryDto {
  @IsOptional()
  @IsIn(VALID_STATUSES, {
    message: `status must be one of: ${VALID_STATUSES.join(', ')}`,
  })
  status?: (typeof VALID_STATUSES)[number];

  @IsOptional()
  @IsIn(VALID_TYPES, {
    message: `type must be one of: ${VALID_TYPES.join(', ')}`,
  })
  type?: (typeof VALID_TYPES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer' })
  @Min(1, { message: 'page must be at least 1' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(100, { message: 'limit must not exceed 100' })
  limit: number = 20;
}
