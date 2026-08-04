import { Controller, Get } from '@nestjs/common';
import { AppService, type ApiInfo } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getInfo(): ApiInfo {
    return this.appService.getInfo();
  }
}
