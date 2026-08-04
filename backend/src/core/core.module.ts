import { Global, Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { PayloadGenerator } from './payload.generator';
import { RuntimeRegistry } from './runtime.registry';

@Global()
@Module({
  controllers: [EventsController],
  providers: [EventsService, PayloadGenerator, RuntimeRegistry],
  exports: [EventsService, PayloadGenerator, RuntimeRegistry],
})
export class CoreModule {}
