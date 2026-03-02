import {
  IsString,
  IsUrl,
  IsArray,
  ArrayMinSize,
  IsNotEmpty,
} from 'class-validator';

export class CreateWebhookEndpointDto {
  @IsUrl({}, { message: 'url must be a valid URL' })
  @IsNotEmpty({ message: 'url must not be empty' })
  url!: string;

  @IsString({ message: 'secret must be a string' })
  @IsNotEmpty({ message: 'secret must not be empty' })
  secret!: string;

  @IsArray({ message: 'events must be an array' })
  @ArrayMinSize(1, { message: 'events must contain at least one event' })
  @IsString({ each: true, message: 'each event must be a string' })
  events!: string[];
}
