import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class HttpRequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger(HttpRequestLoggerMiddleware.name);

  use(req: Request, _res: Response, next: NextFunction): void {
    const ip = req.ip ?? (req.socket?.remoteAddress ?? 'unknown');
    const origin = req.headers.origin ?? '(no-origin-header)';
    this.logger.log(
      `HTTP ${req.method} ${req.originalUrl} ip=${ip} origin=${origin} headers=${JSON.stringify(req.headers)} body=${JSON.stringify(req.body)}`,
    );
    next();
  }
}
