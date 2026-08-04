import { DeviceIdFormat, Machine } from './machine.types';

export const DEFAULT_BROKER_URL =
  process.env.MQTT_DEFAULT_URL ?? 'mqtt://broker.emqx.io:1883';

const ALPHANUM = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Device identities look different per vendor: some ship 10-digit serials,
 * others hex/alphanumeric tags. Both are one click apart in the UI.
 */
export function generateDeviceId(format: DeviceIdFormat): string {
  if (format === 'alphanumeric') {
    let out = '';
    for (let index = 0; index < 12; index += 1) {
      out += ALPHANUM[Math.floor(Math.random() * ALPHANUM.length)];
    }
    return out;
  }
  // Numeric: 10 digits, never leading-zero so it survives a Number() round trip.
  return String(Math.floor(1_000_000_000 + Math.random() * 9_000_000_000));
}

export const SAMPLE_TEMPLATE = `{
  "deviceId": "{{deviceId}}",
  "name": "{{machineName}}",
  "temperature": "{{walk:18:42:0.4}}",
  "humidity": "{{walk:35:85:1.5}}",
  "pressure": "{{float:0.9:1.4:3}}",
  "vibration": "{{sin:0:10:60}}",
  "state": "{{oneOf:RUNNING|IDLE|MAINTENANCE}}",
  "online": "{{bool:0.95}}",
  "sequence": "{{counter}}",
  "timestamp": "{{iso}}"
}`;

export function buildSeedMachine(id: string, now: string): Machine {
  return {
    id,
    name: 'Demo Sensor 01',
    description:
      'Sample machine — edit the broker, topic and JSON template, then hit Start.',
    deviceId: generateDeviceId('numeric'),
    deviceIdFormat: 'numeric',
    broker: {
      url: DEFAULT_BROKER_URL,
      cleanSession: true,
      keepalive: 60,
    },
    publish: {
      topic: 'simulator/{{deviceId}}/telemetry',
      qos: 0,
      retain: false,
      intervalMs: 2000,
      payloadTemplate: SAMPLE_TEMPLATE,
    },
    autoStart: false,
    createdAt: now,
    updatedAt: now,
  };
}
