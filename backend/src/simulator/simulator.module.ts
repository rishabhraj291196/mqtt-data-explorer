import { Module } from '@nestjs/common';
import { MachinesModule } from '../machines/machines.module';
import { MachineControlController } from './machine-control.controller';
import { SimulatorController } from './simulator.controller';
import { SimulatorService } from './simulator.service';

@Module({
  imports: [MachinesModule],
  controllers: [MachineControlController, SimulatorController],
  providers: [SimulatorService],
  exports: [SimulatorService],
})
export class SimulatorModule {}
