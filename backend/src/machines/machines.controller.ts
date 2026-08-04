import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  CloneMachineDto,
  CreateMachineDto,
  UpdateMachineDto,
} from './dto/machine.dto';
import type { MachineStats, MachineWithRuntime } from './machine.types';
import { MachinesService } from './machines.service';

@Controller('machines')
export class MachinesController {
  constructor(private readonly machines: MachinesService) {}

  @Get()
  findAll(): MachineWithRuntime[] {
    return this.machines.findAll();
  }

  /** Declared before `:id` so the literal path wins the route match. */
  @Get('stats')
  stats(): MachineStats[] {
    return this.machines.stats();
  }

  @Get(':id')
  findOne(@Param('id') id: string): MachineWithRuntime {
    return this.machines.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateMachineDto): Promise<MachineWithRuntime> {
    return this.machines.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMachineDto,
  ): Promise<MachineWithRuntime> {
    return this.machines.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<{ ok: true }> {
    return this.machines.remove(id);
  }

  @Post(':id/clone')
  clone(
    @Param('id') id: string,
    @Body() dto: CloneMachineDto,
  ): Promise<MachineWithRuntime[]> {
    return this.machines.clone(id, dto.count ?? 1);
  }
}
