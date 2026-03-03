import { IsOptional, IsInt, Min, Max, IsIn, Matches } from 'class-validator';
import { Type } from 'class-transformer';

const VALID_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export class LogQueryDto {
  @IsOptional()
  @IsIn(VALID_LEVELS, {
    message: `level must be one of: ${VALID_LEVELS.join(', ')}`,
  })
  level?: (typeof VALID_LEVELS)[number];

  @IsOptional()
  @Matches(ISO_DATE_REGEX, {
    message: 'after must be a valid ISO 8601 UTC date string (e.g. 2024-01-01T00:00:00Z)',
  })
  after?: string;

  @IsOptional()
  @Matches(ISO_DATE_REGEX, {
    message: 'before must be a valid ISO 8601 UTC date string (e.g. 2024-12-31T23:59:59Z)',
  })
  before?: string;

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
  limit: number = 100;
}
