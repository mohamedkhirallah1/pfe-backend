import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  getHealth(): { status: 'ok'; timestamp: string; uptime: number } {
    return this.appService.getHealth();
  }
}
