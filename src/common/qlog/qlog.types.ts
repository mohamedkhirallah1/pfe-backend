export type QlogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export interface QlogRequestContext {
  requestId: string;
  correlationId: string;
  method?: string;
  route?: string;
  ip?: string;
  userAgent?: string;
  userId?: string;
  role?: string;
  zoneId?: string;
  startTime?: [number, number];
}

export interface QlogEntry {
  timestamp: string;
  level: QlogLevel;
  service: string;
  module: string;
  message: string;
  requestId?: string;
  correlationId?: string;
  method?: string;
  route?: string;
  statusCode?: number;
  durationMs?: number;
  userId?: string;
  role?: string;
  zoneId?: string;
  ip?: string;
  userAgent?: string;
  error?: {
    name?: string;
    message?: string;
    stack?: string;
    code?: string | number;
  } | null;
  metadata?: Record<string, unknown>;
}

export interface QlogHttpLogOptions {
  requestId: string;
  correlationId?: string;
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  userId?: string;
  role?: string;
  zoneId?: string;
  ip?: string;
  userAgent?: string;
  error?: unknown;
  metadata?: Record<string, unknown>;
}

export interface QlogAiLogOptions {
  scope?: string;
  zoneId?: string;
  analysisType?: string;
  durationMs?: number;
  status: 'started' | 'completed' | 'skipped' | 'failed' | 'fallback';
  provider?: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  error?: unknown;
  metadata?: Record<string, unknown>;
}

export interface QlogBullMqLogOptions {
  queueName: string;
  jobName: string;
  jobId?: string | number;
  event: 'created' | 'started' | 'completed' | 'failed' | 'retried' | 'stalled';
  durationMs?: number;
  attempt?: number;
  error?: unknown;
  metadata?: Record<string, unknown>;
}

export interface QlogWsLogOptions {
  event: 'connected' | 'disconnected' | 'auth_failed' | 'alert_emitted' | 'broadcast';
  clientId?: string;
  userId?: string;
  role?: string;
  zoneId?: string;
  channel?: string;
  error?: unknown;
  metadata?: Record<string, unknown>;
}
