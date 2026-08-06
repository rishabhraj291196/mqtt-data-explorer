import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { DeviceIdFormat, QoS } from '../machine.types';

export const DEVICE_ID_FORMATS: DeviceIdFormat[] = [
  'numeric',
  'alphanumeric',
  'custom',
];

export class BrokerConfigDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^(mqtt|mqtts|ws|wss|tcp|ssl):\/\/[^\s]+$/i, {
    message:
      'broker.url must look like mqtt://host:1883 (mqtt, mqtts, ws or wss)',
  })
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  clientId?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(3600)
  keepalive?: number;

  @IsOptional()
  @IsBoolean()
  cleanSession?: boolean;
}

export class PublishConfigDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  topic!: string;

  @IsOptional()
  @IsIn([0, 1, 2])
  qos?: QoS;

  @IsOptional()
  @IsBoolean()
  retain?: boolean;

  @IsInt()
  @Min(100, { message: 'intervalMs must be at least 100ms' })
  @Max(24 * 60 * 60 * 1000)
  intervalMs!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20_000)
  payloadTemplate!: string;
}

export class CreateMachineDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsIn(DEVICE_ID_FORMATS)
  deviceIdFormat?: DeviceIdFormat;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9._:-]*$/, {
    message:
      'deviceId may only contain letters, digits and . _ : - (no spaces)',
  })
  deviceId?: string;

  @ValidateNested()
  @Type(() => BrokerConfigDto)
  broker!: BrokerConfigDto;

  @ValidateNested()
  @Type(() => PublishConfigDto)
  publish!: PublishConfigDto;

  @IsOptional()
  @IsBoolean()
  autoStart?: boolean;
}

export class UpdateMachineDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsIn(DEVICE_ID_FORMATS)
  deviceIdFormat?: DeviceIdFormat;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9._:-]*$/, {
    message:
      'deviceId may only contain letters, digits and . _ : - (no spaces)',
  })
  deviceId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BrokerConfigDto)
  broker?: BrokerConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PublishConfigDto)
  publish?: PublishConfigDto;

  @IsOptional()
  @IsBoolean()
  autoStart?: boolean;
}

/** Body for handing a machine to another workspace. */
export class MoveMachineDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  workspaceId!: string;
}

/** Body for cloning a machine into N copies. */
export class CloneMachineDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  count?: number;
}

export class PreviewPayloadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20_000)
  payloadTemplate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  topic?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  machineName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  samples?: number;
}
