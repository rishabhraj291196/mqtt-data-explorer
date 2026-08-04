import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  PayloadGenerator,
  TOKEN_DOCS,
  TokenDoc,
} from '../core/payload.generator';
import { PreviewPayloadDto } from '../machines/dto/machine.dto';
import {
  DEFAULT_BROKER_URL,
  SAMPLE_TEMPLATE,
} from '../machines/machine.defaults';
import { SimulatorService } from './simulator.service';

interface PreviewResult {
  ok: boolean;
  error: string | null;
  samples: { topic: string | null; payload: string }[];
}

@Controller('simulator')
export class SimulatorController {
  constructor(
    private readonly simulator: SimulatorService,
    private readonly generator: PayloadGenerator,
  ) {}

  @Get('tokens')
  tokens(): {
    tokens: TokenDoc[];
    sampleTemplate: string;
    defaultBrokerUrl: string;
  } {
    return {
      tokens: TOKEN_DOCS,
      sampleTemplate: SAMPLE_TEMPLATE,
      defaultBrokerUrl: DEFAULT_BROKER_URL,
    };
  }

  /** Renders a template a few times so users can see the dummy data first. */
  @Post('preview')
  preview(@Body() dto: PreviewPayloadDto): PreviewResult {
    const error = this.generator.validate(dto.payloadTemplate);
    if (error) return { ok: false, error, samples: [] };

    const count = dto.samples ?? 3;
    const samples: PreviewResult['samples'] = [];
    this.generator.resetState('preview');
    for (let tick = 1; tick <= count; tick += 1) {
      const ctx = {
        machineId: 'preview',
        machineName: dto.machineName ?? 'preview-machine',
        deviceId: dto.deviceId ?? '1000000001',
        tick,
      };
      // Payload first — it defines the `{{var:…}}` values a topic may reference.
      const payload = this.generator.render(dto.payloadTemplate, ctx);
      samples.push({
        payload,
        topic: dto.topic ? this.generator.renderTopic(dto.topic, ctx) : null,
      });
    }
    this.generator.resetState('preview');
    return { ok: true, error: null, samples };
  }

  @Post('start-all')
  startAll(): { started: number } {
    return this.simulator.startAll();
  }

  @Post('stop-all')
  stopAll(): { stopped: number } {
    return this.simulator.stopAll();
  }
}
