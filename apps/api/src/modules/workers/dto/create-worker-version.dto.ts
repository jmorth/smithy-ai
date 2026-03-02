import { IsObject, IsOptional, IsString } from 'class-validator';

export class CreateWorkerVersionDto {
  @IsObject({ message: 'yamlConfig must be an object' })
  yamlConfig!: Record<string, unknown>;

  @IsOptional()
  @IsString({ message: 'dockerfile must be a string' })
  dockerfile?: string;
}
