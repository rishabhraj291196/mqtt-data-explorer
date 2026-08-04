import { Module } from '@nestjs/common';
import { MachinesController } from './machines.controller';
import { MachinesService } from './machines.service';
import { MachinesStore } from './machines.store';

@Module({
  controllers: [MachinesController],
  providers: [MachinesStore, MachinesService],
  exports: [MachinesService],
})
export class MachinesModule {}
