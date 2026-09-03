import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { QlogService } from '../qlog/qlog.service';
import { QlogContextService } from '../qlog/qlog-context.service';

@Injectable()
export class HttpRequestLoggerMiddleware implements NestMiddleware {
  constructor(
    private readonly qlog: QlogService,
    private readonly contextService: QlogContextService,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const headerRequestId = req.headers['x-request-id'] as string | undefined;
    const headerCorrelationId = req.headers['x-correlation-id'] as string | undefined;

    const requestId = headerRequestId || randomUUID();
    const correlationId = headerCorrelationId || requestId;

    // Set response headers for client tracking
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Correlation-Id', correlationId);

    const startTime = process.hrtime();
    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const initialContext = {
      requestId,
      correlationId,
      method: req.method,
      route: req.originalUrl || req.url,
      ip,
      userAgent,
      startTime,
    };

    // Run inside AsyncLocalStorage context so all downstream service logs share requestId
    this.contextService.runWithContext(initialContext, () => {
      res.on('finish', () => {
        const [seconds, nanoseconds] = process.hrtime(startTime);
        const durationMs = Math.round((seconds * 1000 + nanoseconds / 1e6) * 100) / 100;

        const authUser = (req as any).user as
          | { sub?: string; id?: string; role?: string; zoneId?: string }
          | undefined;

        const userId = authUser?.sub || authUser?.id;
        const role = authUser?.role;
        const zoneId = authUser?.zoneId;

        // Skip /api/metrics endpoint logging if desired, or log cleanly
        if (req.originalUrl && req.originalUrl.includes('/metrics')) {
          return;
        }

        this.qlog.logHttp({
          requestId,
          correlationId,
          method: req.method,
          route: req.baseUrl || req.originalUrl || req.url,
          statusCode: res.statusCode,
          durationMs,
          userId,
          role,
          zoneId,
          ip,
          userAgent,
        });
      });

      next();
    });
  }
}
