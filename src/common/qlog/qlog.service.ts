import { Injectable, LoggerService, Optional } from '@nestjs/common';
import { QlogContextService } from './qlog-context.service';
import {
  QlogAiLogOptions,
  QlogBullMqLogOptions,
  QlogEntry,
  QlogHttpLogOptions,
  QlogLevel,
  QlogWsLogOptions,
} from './qlog.types';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'refreshtoken',
  'accesstoken',
  'jwt',
  'apikey',
  'groq_api_key',
  'groqapikey',
  'authorization',
  'cookie',
  'set-cookie',
  'secret',
  'jwt_secret',
  'credentials',
]);

@Injectable()
export class QlogService implements LoggerService {
  private readonly isProduction: boolean;
  private readonly serviceName = 'fiber-vision-backend';

  constructor(
    @Optional() private readonly contextService?: QlogContextService,
  ) {
    this.isProduction = process.env.NODE_ENV === 'production';
  }

  /**
   * Deeply sanitizes any object or array to replace sensitive keys with [REDACTED].
   */
  public sanitize<T>(data: T): T {
    if (!data || typeof data !== 'object') {
      return data;
    }

    if (data instanceof Error) {
      return {
        name: data.name,
        message: data.message,
        stack: this.isProduction ? undefined : data.stack,
      } as unknown as T;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitize(item)) as unknown as T;
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lowerKey)) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.sanitize(value);
      } else {
        result[key] = value;
      }
    }

    return result as T;
  }

  private buildEntry(
    level: QlogLevel,
    message: string,
    module: string,
    metadata?: Record<string, unknown>,
    error?: unknown,
  ): QlogEntry {
    const ctx = this.contextService?.getContext();

    let formattedError: QlogEntry['error'] = null;
    if (error) {
      if (error instanceof Error) {
        formattedError = {
          name: error.name,
          message: error.message,
          stack: this.isProduction ? undefined : error.stack,
        };
      } else if (typeof error === 'object') {
        formattedError = this.sanitize(error as Record<string, unknown>);
      } else {
        formattedError = { message: String(error) };
      }
    }

    const sanitizedMeta = metadata ? this.sanitize(metadata) : undefined;

    return {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      module: module || 'App',
      message,
      requestId: ctx?.requestId,
      correlationId: ctx?.correlationId,
      userId: ctx?.userId,
      role: ctx?.role,
      zoneId: ctx?.zoneId,
      error: formattedError,
      metadata: sanitizedMeta,
    };
  }

  private output(entry: QlogEntry): void {
    if (this.isProduction) {
      const json = JSON.stringify(entry);
      if (entry.level === 'ERROR' || entry.level === 'FATAL') {
        process.stderr.write(json + '\n');
      } else {
        process.stdout.write(json + '\n');
      }
    } else {
      const levelColors: Record<QlogLevel, string> = {
        DEBUG: '\x1b[36m', // Cyan
        INFO: '\x1b[32m',  // Green
        WARN: '\x1b[33m',  // Yellow
        ERROR: '\x1b[31m', // Red
        FATAL: '\x1b[35m', // Magenta
      };
      const reset = '\x1b[0m';
      const color = levelColors[entry.level] || reset;

      const reqPart = entry.requestId ? ` [req:${entry.requestId.slice(0, 8)}]` : '';
      const userPart = entry.userId ? ` [user:${entry.userId}|role:${entry.role ?? 'N/A'}]` : '';
      const zonePart = entry.zoneId ? ` [zone:${entry.zoneId}]` : '';
      const metaPart =
        entry.metadata && Object.keys(entry.metadata).length > 0
          ? ` ${JSON.stringify(entry.metadata)}`
          : '';
      const errorPart = entry.error ? ` | Error: ${JSON.stringify(entry.error)}` : '';

      const line = `[Qlog] ${entry.timestamp} ${color}${entry.level.padEnd(5)}${reset} [${entry.module}]${reqPart}${userPart}${zonePart} ${entry.message}${metaPart}${errorPart}`;

      if (entry.level === 'ERROR' || entry.level === 'FATAL') {
        process.stderr.write(line + '\n');
      } else {
        process.stdout.write(line + '\n');
      }
    }
  }

  log(message: string, context?: string, metadata?: Record<string, unknown>): void {
    this.info(message, context, metadata);
  }

  info(message: string, context?: string, metadata?: Record<string, unknown>): void {
    const entry = this.buildEntry('INFO', message, context || 'App', metadata);
    this.output(entry);
  }

  debug(message: string, context?: string, metadata?: Record<string, unknown>): void {
    const entry = this.buildEntry('DEBUG', message, context || 'App', metadata);
    this.output(entry);
  }

  warn(message: string, context?: string, metadata?: Record<string, unknown>): void {
    const entry = this.buildEntry('WARN', message, context || 'App', metadata);
    this.output(entry);
  }

  error(message: string, trace?: string, context?: string, metadata?: Record<string, unknown>): void {
    const errObj = trace ? { stack: trace, message } : undefined;
    const entry = this.buildEntry('ERROR', message, context || 'App', metadata, errObj);
    this.output(entry);
  }

  fatal(message: string, trace?: string, context?: string, metadata?: Record<string, unknown>): void {
    const errObj = trace ? { stack: trace, message } : undefined;
    const entry = this.buildEntry('FATAL', message, context || 'App', metadata, errObj);
    this.output(entry);
  }

  /**
   * Specialized Structured HTTP Logging
   */
  logHttp(options: QlogHttpLogOptions): void {
    const isError = options.statusCode >= 500;
    const isWarn = options.statusCode >= 400 && options.statusCode < 500;
    const level: QlogLevel = isError ? 'ERROR' : isWarn ? 'WARN' : 'INFO';

    const entry: QlogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      module: 'Http',
      message: `HTTP ${options.method} ${options.route} ${options.statusCode} (${options.durationMs}ms)`,
      requestId: options.requestId,
      correlationId: options.correlationId,
      method: options.method,
      route: options.route,
      statusCode: options.statusCode,
      durationMs: options.durationMs,
      userId: options.userId,
      role: options.role,
      zoneId: options.zoneId,
      ip: options.ip,
      userAgent: options.userAgent,
      error: options.error
        ? options.error instanceof Error
          ? { name: options.error.name, message: options.error.message, stack: this.isProduction ? undefined : options.error.stack }
          : { message: String(options.error) }
        : null,
      metadata: options.metadata ? this.sanitize(options.metadata) : undefined,
    };

    this.output(entry);
  }

  /**
   * Specialized Structured AI Supervisor Logging
   */
  logAi(options: QlogAiLogOptions): void {
    const level: QlogLevel =
      options.status === 'failed' ? 'ERROR' : options.status === 'fallback' || options.status === 'skipped' ? 'WARN' : 'INFO';

    const msg = `AI ${options.analysisType || 'analysis'} ${options.status}${options.scope ? ` (scope=${options.scope})` : ''}${options.durationMs !== undefined ? ` in ${options.durationMs}ms` : ''}`;

    const entry = this.buildEntry(level, msg, 'AiSupervisor', {
      scope: options.scope,
      zoneId: options.zoneId,
      analysisType: options.analysisType,
      status: options.status,
      provider: options.provider ?? 'Groq',
      model: options.model,
      durationMs: options.durationMs,
      promptTokens: options.promptTokens,
      completionTokens: options.completionTokens,
      ...options.metadata,
    }, options.error);

    this.output(entry);
  }

  /**
   * Specialized Structured BullMQ Queue Logging
   */
  logBullMq(options: QlogBullMqLogOptions): void {
    const level: QlogLevel =
      options.event === 'failed' ? 'ERROR' : options.event === 'stalled' || options.event === 'retried' ? 'WARN' : 'INFO';

    const msg = `BullMQ [${options.queueName}] job=${options.jobName} (id=${options.jobId ?? 'N/A'}) ${options.event}${options.durationMs !== undefined ? ` (${options.durationMs}ms)` : ''}`;

    const entry = this.buildEntry(level, msg, 'BullMQ', {
      queueName: options.queueName,
      jobName: options.jobName,
      jobId: options.jobId,
      event: options.event,
      durationMs: options.durationMs,
      attempt: options.attempt,
      ...options.metadata,
    }, options.error);

    this.output(entry);
  }

  /**
   * Specialized Structured WebSocket Logging
   */
  logWs(options: QlogWsLogOptions): void {
    const level: QlogLevel =
      options.event === 'auth_failed' ? 'WARN' : 'INFO';

    const msg = `WebSocket [${options.event}] client=${options.clientId ?? 'unknown'}${options.channel ? ` channel=${options.channel}` : ''}${options.userId ? ` user=${options.userId}` : ''}`;

    const entry = this.buildEntry(level, msg, 'WebSocket', {
      event: options.event,
      clientId: options.clientId,
      userId: options.userId,
      role: options.role,
      zoneId: options.zoneId,
      channel: options.channel,
      ...options.metadata,
    }, options.error);

    this.output(entry);
  }
}
