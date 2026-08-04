import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { AppModule } from './../src/app.module';

describe('Simulator API (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    // Keep the real machines.json untouched.
    process.env.DATA_FILE = join(mkdtempSync(join(tmpdir(), 'sim-')), 'machines.json');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET) reports the API info', () => {
    return request(app.getHttpServer()).get('/').expect(200).expect(/"status":"ok"/);
  });

  it('/machines (GET) returns the seeded machine', async () => {
    const response = await request(app.getHttpServer()).get('/machines').expect(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body[0]).toHaveProperty('runtime.status', 'stopped');
  });

  it('/simulator/preview (POST) renders tokens with their real types', async () => {
    const response = await request(app.getHttpServer())
      .post('/simulator/preview')
      .send({ payloadTemplate: '{"n":"{{int:5:5}}","s":"{{seq:A|B}}"}', samples: 2 })
      .expect(201);

    expect(response.body.ok).toBe(true);
    expect(JSON.parse(response.body.samples[0].payload)).toEqual({ n: 5, s: 'A' });
    expect(JSON.parse(response.body.samples[1].payload)).toEqual({ n: 5, s: 'B' });
  });

  it('/machines/stats (GET) returns counters only, not payloads', async () => {
    // Also guards the route order: `stats` must not be swallowed by `:id`.
    const response = await request(app.getHttpServer())
      .get('/machines/stats')
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(Object.keys(response.body[0]).sort()).toEqual([
      'errorCount',
      'id',
      'lastError',
      'lastPublishAt',
      'messagesSent',
      'status',
    ]);
  });

  it('/simulator/preview (POST) resolves tokens in object keys', async () => {
    const response = await request(app.getHttpServer())
      .post('/simulator/preview')
      .send({
        payloadTemplate: '{"{{machineName}}":{"ok":"{{bool:1}}"}}',
        machineName: '1206260070',
        samples: 1,
      })
      .expect(201);

    expect(JSON.parse(response.body.samples[0].payload)).toEqual({
      '1206260070': { ok: true },
    });
  });

  it('/simulator/preview (POST) reuses {{var}} values and maps them with {{range}}', async () => {
    const response = await request(app.getHttpServer())
      .post('/simulator/preview')
      .send({
        payloadTemplate: JSON.stringify({
          // `battery` is referenced above the field that defines it on purpose.
          battery: '{{var:batt}}',
          colour: '{{range:batt:20=#E14343|50=#E1CB43|*=#17AF35}}',
          data: [{ type: 'battery', value: '{{var:batt:int:70:70}}' }],
        }),
        samples: 1,
      })
      .expect(201);

    expect(JSON.parse(response.body.samples[0].payload)).toEqual({
      battery: 70,
      colour: '#17AF35',
      data: [{ type: 'battery', value: 70 }],
    });
  });

  it('/machines (POST) generates a device id in the requested format', async () => {
    const base = {
      broker: { url: 'mqtt://localhost:1883' },
      publish: {
        topic: 'test/{{deviceId}}',
        intervalMs: 1000,
        payloadTemplate: '{"id":"{{deviceId}}"}',
      },
    };

    const numeric = await request(app.getHttpServer())
      .post('/machines')
      .send({ ...base, name: 'Numeric device', deviceIdFormat: 'numeric' })
      .expect(201);
    expect(numeric.body.deviceId).toMatch(/^[1-9]\d{9}$/);

    const alpha = await request(app.getHttpServer())
      .post('/machines')
      .send({ ...base, name: 'Alpha device', deviceIdFormat: 'alphanumeric' })
      .expect(201);
    expect(alpha.body.deviceId).toMatch(/^[a-z0-9]{12}$/);

    const custom = await request(app.getHttpServer())
      .post('/machines')
      .send({
        ...base,
        name: 'Custom device',
        deviceIdFormat: 'custom',
        deviceId: '1206260070',
      })
      .expect(201);
    expect(custom.body.deviceId).toBe('1206260070');

    // Every duplicate is a separate device, so identities must not repeat.
    const copies = await request(app.getHttpServer())
      .post(`/machines/${numeric.body.id}/clone`)
      .send({ count: 3 })
      .expect(201);
    const ids = copies.body.map((m: { deviceId: string }) => m.deviceId);
    expect(new Set([...ids, numeric.body.deviceId]).size).toBe(4);
    ids.forEach((id: string) => expect(id).toMatch(/^[1-9]\d{9}$/));
  });

  it('/simulator/preview (POST) rejects broken JSON with a helpful message', async () => {
    const response = await request(app.getHttpServer())
      .post('/simulator/preview')
      .send({ payloadTemplate: '{"n": {{int:1:2}}}' })
      .expect(201);

    expect(response.body.ok).toBe(false);
    expect(response.body.error).toContain('Invalid JSON');
  });
});
