import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

@Injectable()
export class ParseSlugPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!value || !SLUG_REGEX.test(value)) {
      throw new BadRequestException(
        `Invalid slug "${value}". Slugs must match [a-z0-9]+(-[a-z0-9]+)*`,
      );
    }
    return value;
  }
}
