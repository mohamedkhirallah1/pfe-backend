import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import IORedis from 'ioredis';
import { AiMetricsService } from './ai-metrics.service';

const KEY_PREFIX = 'ai-supervisor:explanation-cache:';
// Just under the hourly cron cadence: a cached explanation is reused for the rest of the same
// hour if the underlying metrics hash hasn't changed, but never survives into the next run.
const DEFAULT_TTL_SECONDS = 55 * 60;

/**
 * Skips a Groq call entirely when the input that would be sent for a given (scope, analysisType)
 * is byte-for-byte the same as last time — reuses the previous LLM explanation instead. Uses the
 * Redis the project already depends on (BullMQ's REDIS_URL), no new infra.
 */
@Injectable()
export class ExplanationCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(ExplanationCacheService.name);
  private readonly client: IORedis;

  constructor(
    private readonly configService: ConfigService,
    private readonly metrics: AiMetricsService,
  ) {
    const redisUrl = this.configService.get<string>('REDIS_URL', 'redis://127.0.0.1:6379');
    this.client = new IORedis(redisUrl, { maxRetriesPerRequest: 1, enableReadyCheck: false, lazyConnect: true });
    this.client.on('error', (err) => {
      this.logger.warn(`Explanation cache Redis error (cache disabled for this call): ${err.message}`);
    });
  }

  private hashState(state: unknown): string {
    return createHash('sha1').update(JSON.stringify(state)).digest('hex').slice(0, 16);
  }

  private key(scope: string, analysisType: string, stateHash: string): string {
    return `${KEY_PREFIX}${analysisType}:${scope}:${stateHash}`;
  }

  /**
   * Returns the cached value for this exact (scope, analysisType, state) combination, or null on
   * a miss / cache unavailable. Never throws — a Redis outage just means more Groq calls, not a
   * broken analysis.
   */
  async get<T>(scope: string, analysisType: string, state: unknown): Promise<T | null> {
    try {
      if (this.client.status !== 'ready' && this.client.status !== 'connecting') {
        await this.client.connect();
      }
      const raw = await this.client.get(this.key(scope, analysisType, this.hashState(state)));
      if (raw) {
        this.metrics.incrCacheHit();
        return JSON.parse(raw) as T;
      }
      this.metrics.incrCacheMiss();
      return null;
    } catch {
      this.metrics.incrCacheMiss();
      return null;
    }
  }

  async set(scope: string, analysisType: string, state: unknown, value: unknown, ttlSeconds = DEFAULT_TTL_SECONDS): Promise<void> {
    try {
      if (this.client.status !== 'ready' && this.client.status !== 'connecting') {
        await this.client.connect();
      }
      await this.client.set(this.key(scope, analysisType, this.hashState(state)), JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // Best-effort cache write — a failure here must never fail the analysis.
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.client.disconnect();
  }
}
