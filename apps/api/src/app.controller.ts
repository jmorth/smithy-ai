import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  healthCheck(): { status: string } {
    return { status: 'ok' };
  }
}
