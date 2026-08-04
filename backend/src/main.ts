import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import type { Request, Response } from 'express';
import compression from 'compression';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.use(
    compression({
      // Never compress the SSE stream — buffering would stall the live feed.
      filter: (req: Request, res: Response) => {
        if (req.path.includes('/events/stream')) return false;
        const contentType = String(res.getHeader('Content-Type') ?? '');
        if (contentType.includes('text/event-stream')) return false;
        return compression.filter(req, res);
      },
    }),
  );
  app.use(helmet({ contentSecurityPolicy: false }));
  app.enableCors();

  // Timers must be released so the process can exit cleanly.
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  new Logger('Bootstrap').log(
    `MQTT device simulator API on http://localhost:${port}/api`,
  );
}
void bootstrap();
