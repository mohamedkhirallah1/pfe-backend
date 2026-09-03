import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import IORedis from 'ioredis';
import { WebsocketBroadcastGateway } from '../../websocket-server/websocket-broadcast.gateway';
import { RiskLevel } from '../interfaces/analysis.types';
import { buildNetworkHealthPrompt } from '../prompts/network-health.prompt';
import { GroqService } from './groq.service';

export type ServiceHealth = {
  name: 'mongodb' | 'redis' | 'websocket';
  healthy: boolean;
  latencyMs?: number;
  detail?: string;
};

export type AppHealthReport = {
  services: ServiceHealth[];
  overallRisk: RiskLevel;
};

/**
 * Independent, read-only health probes. Deliberately does NOT reach into RabbitMqService (a
 * business/infra module we're told not to modify) — it opens its own short-lived Redis
 * connection using the same REDIS_URL, since RabbitMqService is itself BullMQ-over-Redis and
 * that connection IS the "queue" backend this app actually depends on.
 */
@Injectable()
export class AppHealthService {
  private readonly logger = new Logger(AppHealthService.name);

  constructor(
    @InjectConnection() private readonly mongoConnection: Connection,
    private readonly configService: ConfigService,
    private readonly websocketGateway: WebsocketBroadcastGateway,
    private readonly groqService: GroqService,
  ) {}

  async checkAll(): Promise<AppHealthReport> {
    const services = await Promise.all([this.checkMongo(), this.checkRedis(), this.checkWebsocket()]);
    const unhealthyCount = services.filter((s) => !s.healthy).length;

    let overallRisk: RiskLevel;
    if (unhealthyCount === 0) overallRisk = RiskLevel.LOW;
    else if (unhealthyCount === 1) overallRisk = RiskLevel.MEDIUM;
    else overallRisk = RiskLevel.CRITICAL;

    return { services, overallRisk };
  }

  /**
   * Same probes as checkAll(), plus an LLM narrative explaining operational impact when
   * something is degraded. Only used by the on-demand admin endpoint, not the 5-minute cron
   * tier — that tier stays LLM-free by design so it never depends on Groq being reachable.
   */
  async checkAllWithNarrative(): Promise<AppHealthReport & { narrative?: string }> {
    const report = await this.checkAll();
    if (report.overallRisk === RiskLevel.LOW || !this.groqService.isConfigured) {
      return report;
    }

    const llmResult = await this.groqService.chatJSON<{ summary: string }>(
      buildNetworkHealthPrompt({ services: report.services, overallRisk: report.overallRisk }),
    );

    return { ...report, narrative: llmResult?.summary };
  }

  private async checkMongo(): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      // readyState 1 = connected. A ping confirms the connection is actually responsive,
      // not just "was connected at some point".
      if (this.mongoConnection.readyState !== 1 || !this.mongoConnection.db) {
        return { name: 'mongodb', healthy: false, detail: `readyState=${this.mongoConnection.readyState}` };
      }
      await this.mongoConnection.db.admin().ping();
      return { name: 'mongodb', healthy: true, latencyMs: Date.now() - start };
    } catch (error) {
      return { name: 'mongodb', healthy: false, detail: (error as Error).message };
    }
  }

  private async checkRedis(): Promise<ServiceHealth> {
    const redisUrl = this.configService.get<string>('REDIS_URL', 'redis://127.0.0.1:6379');
    const client = new IORedis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      connectTimeout: 2000,
      lazyConnect: true,
    });
    client.on('error', () => {
      // Swallowed intentionally: the ping() call below already surfaces the failure to the
      // caller; without this listener an unhandled 'error' event would crash the process.
    });

    const start = Date.now();
    try {
      await client.connect();
      await client.ping();
      return { name: 'redis', healthy: true, latencyMs: Date.now() - start };
    } catch (error) {
      return { name: 'redis', healthy: false, detail: (error as Error).message };
    } finally {
      client.disconnect();
    }
  }

  private async checkWebsocket(): Promise<ServiceHealth> {
    const server = this.websocketGateway.server;
    if (!server) {
      return { name: 'websocket', healthy: false, detail: 'Socket.IO server not initialized' };
    }
    return { name: 'websocket', healthy: true, detail: `${server.engine?.clientsCount ?? 0} client(s) connected` };
  }
}
