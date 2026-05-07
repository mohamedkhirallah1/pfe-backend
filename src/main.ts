import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { createServer } from 'net';

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();

    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        resolve(false);
        return;
      }

      resolve(false);
    });

    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    server.listen(port);
  });
}

function logEnvironmentDiagnostics(logger: Logger, port: number): void {
  const backendUrl = process.env.BACKEND_URL ?? '(not set)';
  const nodeEnv = process.env.NODE_ENV ?? '(not set)';

  logger.log(`ENV PORT=${port}`);
  logger.log(`ENV BACKEND_URL=${backendUrl}`);
  logger.log(`ENV NODE_ENV=${nodeEnv}`);

  if (backendUrl !== '(not set)') {
    try {
      const parsed = new URL(backendUrl);
      const backendPort = parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80;

      if (backendPort === port) {
        logger.warn(`BACKEND_URL uses the same port as this app (${port}). Check upstream/downstream URLs.`);
      }
    } catch {
      logger.warn('BACKEND_URL is set but not a valid URL.');
    }
  }
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.HOST ?? '0.0.0.0';

  const portAvailable = await isPortAvailable(port);
  if (!portAvailable) {
    logger.error(`PORT ALREADY IN USE: ${port}`);
    process.exit(1);
  }

  logEnvironmentDiagnostics(logger, port);

  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen(port, host);

  const baseUrl = await app.getUrl();
  logger.log(`BACKEND RUNNING ON: ${baseUrl}`);
  logger.log(`NETWORK BIND host=${host} port=${port}`);
  logger.log('API routes are available under /api (e.g., /api/health, /api/events).');
}
bootstrap();
