import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { MetricsService } from './common/metrics/metrics.service';
import { QlogService } from './common/qlog/qlog.service';
import { QlogContextService } from './common/qlog/qlog-context.service';
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

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const allowedOriginPatterns = [
    /^http:\/\/localhost:(3000|3001|5173|5174|5175|4173)$/,
    /^http:\/\/127\.0\.0\.1:(3000|3001|5173|5174|5175|4173)$/,
    /^http:\/\/192\.168\.\d+\.\d+:(3000|3001|5173|5174|5175|4173)$/,
    /^http:\/\/172\.\d+\.\d+\.\d+:(3000|3001|5173|5174|5175|4173)$/,
    /^http:\/\/10\.0\.2\.2:(3000|3001|5173|5174|5175|4173)$/,
  ];

  const envOrigins = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (requestOrigin, callback) => {
      if (!requestOrigin) {
        return callback(null, true);
      }
      if (
        envOrigins.includes(requestOrigin) ||
        allowedOriginPatterns.some((pattern) => pattern.test(requestOrigin))
      ) {
        return callback(null, true);
      }
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-api-key',
      'Accept',
      'Origin',
      'X-Requested-With',
      'x-request-id',
      'x-correlation-id',
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  const metricsService = app.get(MetricsService);
  const qlogService = app.get(QlogService);
  const qlogContextService = app.get(QlogContextService);

  app.useLogger(qlogService);
  app.useGlobalFilters(
    new HttpExceptionFilter(metricsService, qlogService, qlogContextService),
  );

  await app.listen(port, host);

  const baseUrl = await app.getUrl();
  logger.log(`BACKEND RUNNING ON: ${baseUrl}`);
  logger.log(`NETWORK BIND host=${host} port=${port}`);
  logger.log('API routes are available under /api (e.g., /api/health, /api/events).');
}
bootstrap();
