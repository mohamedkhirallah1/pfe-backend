import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { MetricsService } from '../metrics/metrics.service';
import { QlogService } from '../qlog/qlog.service';
import { QlogContextService } from '../qlog/qlog-context.service';

@Catch()
@Injectable()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly isProduction = process.env.NODE_ENV === 'production';

  constructor(
    @Optional() private readonly metricsService?: MetricsService,
    @Optional() private readonly qlog?: QlogService,
    @Optional() private readonly contextService?: QlogContextService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    const requestId =
      this.contextService?.getRequestId() ||
      (request.headers['x-request-id'] as string) ||
      undefined;

    // Format the client error message safely
    let clientError: any;
    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      clientError = exceptionResponse;
    } else if (typeof exceptionResponse === 'string') {
      clientError = { message: exceptionResponse };
    } else if (exception instanceof Error) {
      clientError = {
        message: this.isProduction && status === HttpStatus.INTERNAL_SERVER_ERROR
          ? 'Internal server error'
          : exception.message,
      };
    } else {
      clientError = { message: 'Internal server error' };
    }

    // Log structured exception via Qlog
    if (this.qlog) {
      const errObj = exception instanceof Error ? exception : new Error(String(exception));
      const logMessage = `Exception on ${request.method} ${request.url}: ${errObj.message}`;

      if (status >= 500) {
        this.qlog.error(
          logMessage,
          errObj.stack,
          'HttpExceptionFilter',
          {
            statusCode: status,
            route: request.url,
            method: request.method,
            requestId,
          },
        );
      } else {
        this.qlog.warn(logMessage, 'HttpExceptionFilter', {
          statusCode: status,
          route: request.url,
          method: request.method,
          requestId,
        });
      }
    }

    // Record Prometheus metrics
    if (this.metricsService) {
      this.metricsService.recordHttpRequest(
        request.method,
        request.url,
        status,
        0.005,
      );
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      requestId,
      error: clientError,
    });
  }
}