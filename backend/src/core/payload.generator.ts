import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export interface RenderContext {
  machineId: string;
  machineName: string;
  /** The device identity configured on the machine — `{{deviceId}}`. */
  deviceId: string;
  /** Publish counter for this run, starting at 1. */
  tick: number;
}

export interface TokenDoc {
  token: string;
  description: string;
  example: string;
}

/** Shown in the UI so users know what they can put in a template. */
export const TOKEN_DOCS: TokenDoc[] = [
  {
    token: '{{int:min:max}}',
    description: 'Random whole number',
    example: '{{int:0:100}} → 73',
  },
  {
    token: '{{float:min:max:decimals}}',
    description: 'Random decimal number',
    example: '{{float:20:30:2}} → 24.71',
  },
  {
    token: '{{walk:min:max:maxStep}}',
    description:
      'Smooth random walk — realistic sensor drift, remembers the previous value',
    example: '{{walk:18:42:0.4}} → 24.3, 24.6, 24.2 …',
  },
  {
    token: '{{sin:min:max:periodSeconds}}',
    description: 'Sine wave between min and max',
    example: '{{sin:0:10:60}} → smooth 60s cycle',
  },
  {
    token: '{{counter}} / {{counter:start:step}}',
    description: 'Incrementing number per message',
    example: '{{counter:1:1}} → 1, 2, 3 …',
  },
  {
    token: '{{bool}} / {{bool:probability}}',
    description: 'true / false',
    example: '{{bool:0.9}} → true 90% of the time',
  },
  {
    token: '{{oneOf:A|B|C}}',
    description: 'Random pick from a list',
    example: '{{oneOf:RUNNING|IDLE|FAULT}}',
  },
  {
    token: '{{seq:A|B|C}}',
    description: 'Cycles through the list in order',
    example: '{{seq:ON|OFF}} → ON, OFF, ON …',
  },
  { token: '{{uuid}}', description: 'Random UUID v4', example: '{{uuid}}' },
  {
    token: '{{iso}}',
    description: 'Current time, ISO-8601',
    example: '2026-08-03T10:15:30.123Z',
  },
  {
    token: '{{epoch}} / {{unix}}',
    description: 'Current time in milliseconds / seconds',
    example: '{{unix}} → 1785000000',
  },
  {
    token: '{{date}} / {{time}}',
    description: 'Local date / time strings',
    example: '2026-08-03 / 15:42:07',
  },
  {
    token: '{{deviceId}}',
    description:
      'The device id configured on the machine — numeric, alphanumeric or your own. Every duplicate gets a fresh one.',
    example: '{{deviceId}} → 1206260070',
  },
  {
    token: '{{machineId}} / {{machineName}}',
    description: "Internal UUID / the machine's display name",
    example: 'Demo Sensor 01',
  },
  {
    token: '{{tick}}',
    description: 'Message number in the current run',
    example: '{{tick}} → 42',
  },
  {
    token: '{{str:length}} / {{hex:length}}',
    description: 'Random string / hex string',
    example: '{{hex:8}} → 3f9a02bc',
  },
  {
    token: '{{ip}} / {{mac}}',
    description: 'Random IPv4 / MAC address',
    example: '10.42.7.19',
  },
  {
    token: '{{lat}} / {{lng}}',
    description: 'Random GPS coordinate',
    example: '{{lat}} → 28.6139',
  },
  {
    token: '{{var:name:token}} then {{var:name}}',
    description:
      'Generates a value once and reuses the same value everywhere else in the message. Order does not matter.',
    example:
      '"value": "{{var:batt:walk:5:100:0.5}}" … "battery": "{{var:batt}}" → both 47.3',
  },
  {
    token: '{{range:name:limit=out|limit=out|*=out}}',
    description:
      'Picks an output based on a {{var}} value — first bucket the number fits into wins. Great for status colours and labels.',
    example:
      '{{range:aqi:50=#17AF35|100=#74CB40|*=#E14343}} → #74CB40 when aqi is 56',
  },
  {
    token: 'Tokens in object keys',
    description:
      'Keys accept tokens too, so a payload can be shaped like { "<deviceId>": { … } }.',
    example: '"{{machineName}}": { "data": [ … ] }',
  },
];

const FULL_TOKEN = /^\{\{\s*([^{}]+?)\s*\}\}$/;
const ANY_TOKEN = /\{\{\s*([^{}]+?)\s*\}\}/g;
const ALPHANUM = 'abcdefghijklmnopqrstuvwxyz0123456789';

type Primitive = string | number | boolean;

function toNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** Math.max(0, Math.min(10, decimals));
  return Math.round(value * factor) / factor;
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

/**
 * Turns a JSON (or plain text) template full of `{{token}}` placeholders into a
 * concrete payload. A value that is *exactly* one token keeps its native type,
 * so `"temp": "{{float:1:2:1}}"` publishes `"temp": 1.4` — a real number, not a
 * string. Tokens mixed with text interpolate as strings.
 */
@Injectable()
export class PayloadGenerator {
  /** Per machine + per field state for stateful tokens (walk, counter, seq). */
  private readonly state = new Map<string, number>();

  /** Named values for the message currently being rendered — see `{{var:…}}`. */
  private vars = new Map<string, Primitive>();

  render(template: string, ctx: RenderContext): string {
    this.vars = new Map();

    let parsed: unknown;
    try {
      parsed = JSON.parse(template);
    } catch {
      // Not JSON — treat the whole template as raw text (CSV, plain values, …).
      this.collectVars(template, ctx);
      return String(this.resolveString(template, ctx, '$raw'));
    }
    // Two passes: every `{{var:name:…}}` is evaluated first, so a `{{var:name}}`
    // or `{{range:name:…}}` can sit anywhere in the template — even above the
    // field that defines it.
    this.collectVars(parsed, ctx);
    return JSON.stringify(this.walk(parsed, ctx, '$'));
  }

  /** Topics are plain strings, never JSON. */
  renderTopic(topic: string, ctx: RenderContext): string {
    return String(this.resolveString(topic, ctx, '$topic'));
  }

  /**
   * Validates a template without publishing.
   * Returns an error message, or null when the template is usable.
   */
  validate(template: string): string | null {
    const trimmed = template.trim();
    if (!trimmed) return 'Payload template is empty';
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        JSON.parse(trimmed);
      } catch (error) {
        return `Invalid JSON: ${(error as Error).message}. Tip: keep tokens inside quotes — "temp": "{{int:1:9}}" still publishes a real number.`;
      }
    }
    try {
      this.render(trimmed, {
        machineId: 'preview',
        machineName: 'preview',
        deviceId: 'preview',
        tick: 1,
      });
    } catch (error) {
      return `Template could not be rendered: ${(error as Error).message}`;
    } finally {
      // The dry run must not advance counters used by the preview endpoint.
      this.resetState('preview');
    }
    return null;
  }

  /** Drops stateful values so a restarted machine begins from scratch. */
  resetState(machineId: string): void {
    const prefix = `${machineId}|`;
    for (const key of this.state.keys()) {
      if (key.startsWith(prefix)) this.state.delete(key);
    }
  }

  /**
   * Pass one: evaluate every `{{var:name:expression}}` in the template and
   * remember the result, so later passes can reference it by name.
   */
  private collectVars(value: unknown, ctx: RenderContext): void {
    if (typeof value === 'string') {
      for (const match of value.matchAll(ANY_TOKEN)) {
        const parts = match[1].split(':').map((part) => part.trim());
        if (parts[0]?.toLowerCase() !== 'var' || parts.length < 3) continue;
        const varName = parts[1];
        this.vars.set(
          varName,
          this.resolveToken(
            parts.slice(2).join(':'),
            ctx,
            // Keyed by name, not by position, so a var keeps drifting smoothly
            // even if the field it lives in moves around the template.
            `$var.${varName}`,
          ),
        );
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => this.collectVars(item, ctx));
      return;
    }
    if (value && typeof value === 'object') {
      Object.values(value as Record<string, unknown>).forEach((item) =>
        this.collectVars(item, ctx),
      );
    }
  }

  private walk(value: unknown, ctx: RenderContext, path: string): unknown {
    if (typeof value === 'string') return this.resolveString(value, ctx, path);
    if (Array.isArray(value)) {
      return value.map((item, index) =>
        this.walk(item, ctx, `${path}[${index}]`),
      );
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(
        value as Record<string, unknown>,
      )) {
        // Object *keys* accept tokens too — that is how a payload can be shaped
        // like `{ "<deviceId>": { … } }`.
        const renderedKey = key.includes('{{')
          ? String(this.resolveString(key, ctx, `${path}.${key}$key`))
          : key;
        out[renderedKey] = this.walk(item, ctx, `${path}.${key}`);
      }
      return out;
    }
    return value;
  }

  private resolveString(
    raw: string,
    ctx: RenderContext,
    path: string,
  ): Primitive {
    const full = FULL_TOKEN.exec(raw);
    if (full) return this.resolveToken(full[1], ctx, path);

    let index = 0;
    return raw.replace(ANY_TOKEN, (_match, expression: string) =>
      String(this.resolveToken(expression, ctx, `${path}#${index++}`)),
    );
  }

  private resolveToken(
    expression: string,
    ctx: RenderContext,
    path: string,
  ): Primitive {
    const parts = expression.split(':').map((part) => part.trim());
    const name = (parts[0] ?? '').toLowerCase();
    const args = parts.slice(1);
    const rest = args.join(':');
    const key = `${ctx.machineId}|${path}|${name}`;
    const now = new Date();

    switch (name) {
      case 'var': {
        // Definitions were already evaluated in collectVars(); both
        // `{{var:name:expr}}` and `{{var:name}}` just read the stored value.
        return this.vars.get(args[0]) ?? '';
      }
      case 'range': {
        // {{range:sourceVar:50=low|100=mid|*=high}} — first bucket whose upper
        // bound the value fits into wins. Used to derive a colour or a label
        // from a number that was generated elsewhere in the same message.
        const source = Number(this.vars.get(args[0]));
        for (const bucket of args.slice(1).join(':').split('|')) {
          const separator = bucket.indexOf('=');
          if (separator === -1) continue;
          const limit = bucket.slice(0, separator).trim();
          const output = bucket.slice(separator + 1);
          if (
            limit === '*' ||
            (Number.isFinite(source) && source <= Number(limit))
          ) {
            return /^-?\d+(\.\d+)?$/.test(output) ? Number(output) : output;
          }
        }
        return '';
      }
      case 'int':
      case 'integer': {
        const min = toNumber(args[0], 0);
        const max = toNumber(args[1], 100);
        return Math.round(min + Math.random() * (max - min));
      }
      case 'float':
      case 'number': {
        const min = toNumber(args[0], 0);
        const max = toNumber(args[1], 100);
        return round(min + Math.random() * (max - min), toNumber(args[2], 2));
      }
      case 'walk': {
        const min = toNumber(args[0], 0);
        const max = toNumber(args[1], 100);
        const step = Math.abs(toNumber(args[2], (max - min) / 20));
        const previous =
          this.state.get(key) ?? min + Math.random() * (max - min);
        const next = Math.min(
          max,
          Math.max(min, previous + (Math.random() * 2 - 1) * step),
        );
        this.state.set(key, next);
        return round(next, 3);
      }
      case 'sin': {
        const min = toNumber(args[0], 0);
        const max = toNumber(args[1], 100);
        const period = Math.max(0.001, toNumber(args[2], 60));
        const mid = (min + max) / 2;
        const amplitude = (max - min) / 2;
        const phase = (2 * Math.PI * (Date.now() / 1000)) / period;
        return round(mid + amplitude * Math.sin(phase), 3);
      }
      case 'counter':
      case 'inc': {
        const start = toNumber(args[0], 1);
        const step = toNumber(args[1], 1);
        const previous = this.state.get(key);
        const next = previous === undefined ? start : previous + step;
        this.state.set(key, next);
        return next;
      }
      case 'bool':
      case 'boolean':
        return Math.random() < toNumber(args[0], 0.5);
      case 'oneof': {
        const options = rest.split('|').filter((option) => option.length > 0);
        if (options.length === 0) return '';
        return options[Math.floor(Math.random() * options.length)];
      }
      case 'seq': {
        const options = rest.split('|').filter((option) => option.length > 0);
        if (options.length === 0) return '';
        const index = this.state.get(key) ?? 0;
        this.state.set(key, (index + 1) % options.length);
        return options[index % options.length];
      }
      case 'uuid':
        return randomUUID();
      case 'iso':
      case 'now':
        return now.toISOString();
      case 'epoch':
      case 'timestamp':
        return now.getTime();
      case 'unix':
        return Math.floor(now.getTime() / 1000);
      case 'date':
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      case 'time':
        return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      case 'deviceid':
        return ctx.deviceId;
      case 'machineid':
        return ctx.machineId;
      case 'machinename':
        return ctx.machineName;
      case 'tick':
        return ctx.tick;
      case 'str':
      case 'string': {
        const length = Math.min(256, Math.max(1, toNumber(args[0], 8)));
        let out = '';
        for (let i = 0; i < length; i += 1) {
          out += ALPHANUM[Math.floor(Math.random() * ALPHANUM.length)];
        }
        return out;
      }
      case 'hex': {
        const length = Math.min(256, Math.max(1, toNumber(args[0], 8)));
        let out = '';
        for (let i = 0; i < length; i += 1) {
          out += Math.floor(Math.random() * 16).toString(16);
        }
        return out;
      }
      case 'ip':
        return `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 254) + 1}`;
      case 'mac':
        return Array.from({ length: 6 }, () =>
          Math.floor(Math.random() * 256)
            .toString(16)
            .padStart(2, '0'),
        ).join(':');
      case 'lat':
        return round(-90 + Math.random() * 180, 6);
      case 'lng':
      case 'lon':
        return round(-180 + Math.random() * 360, 6);
      default:
        // Unknown token: leave it untouched so the mistake is visible.
        return `{{${expression}}}`;
    }
  }
}
