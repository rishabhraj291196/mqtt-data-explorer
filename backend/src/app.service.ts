import { Injectable } from '@nestjs/common';

export interface ApiInfo {
  name: string;
  status: 'ok';
  endpoints: string[];
}

@Injectable()
export class AppService {
  getInfo(): ApiInfo {
    return {
      name: 'MQTT Device Simulator API',
      status: 'ok',
      endpoints: [
        'GET    /api/machines',
        'POST   /api/machines',
        'PATCH  /api/machines/:id',
        'DELETE /api/machines/:id',
        'POST   /api/machines/:id/clone',
        'POST   /api/machines/:id/start',
        'POST   /api/machines/:id/stop',
        'POST   /api/machines/:id/restart',
        'POST   /api/machines/:id/publish-once',
        'POST   /api/machines/:id/test-connection',
        'POST   /api/simulator/start-all',
        'POST   /api/simulator/stop-all',
        'POST   /api/simulator/preview',
        'GET    /api/simulator/tokens',
        'GET    /api/events/stream (SSE)',
        'GET    /api/events/recent',
      ],
    };
  }
}
