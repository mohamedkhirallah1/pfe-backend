import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const httpContext = context.switchToHttp();
    const req = httpContext.getRequest<Request>();
    const res = httpContext.getResponse<Response>();

    // Skip tracking the /api/metrics scrape endpoint itself to avoid self-pollution
    if (req.url && req.url.includes('/metrics')) {
      return next.handle();
    }

    const startTime = process.hrtime();
    const method = req.method;
    const route = req.route?.path ?? req.baseUrl ?? req.url ?? 'unknown';

    return next.handle().pipe(
      tap({
        next: () => {
          const [seconds, nanoseconds] = process.hrtime(startTime);
          const durationSeconds = seconds + nanoseconds / 1e9;
          const statusCode = res.statusCode || 200;

          this.metricsService.recordHttpRequest(
            method,
            route,
            statusCode,
            durationSeconds,
          );
        },
        error: (error: any) => {
          const [seconds, nanoseconds] = process.hrtime(startTime);
          const durationSeconds = seconds + nanoseconds / 1e9;
          const statusCode = error.status || error.statusCode || 500;

          this.metricsService.recordHttpRequest(
            method,
            route,
            statusCode,
            durationSeconds,
          );
        },
      }),
    );
  }
}
