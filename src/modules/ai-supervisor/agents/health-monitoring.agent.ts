import { Injectable } from '@nestjs/common';
import { AppHealthReport, AppHealthService } from '../services/app-health.service';

/**
 * Thin agent facade over AppHealthService: keeps the "Health Monitoring Agent" name from the
 * agent roster without re-implementing the Mongo/Redis/WebSocket probes, which stay a single
 * source of truth in AppHealthService.
 */
@Injectable()
export class HealthMonitoringAgent {
  constructor(private readonly appHealthService: AppHealthService) {}

  checkAll(): Promise<AppHealthReport> {
    return this.appHealthService.checkAll();
  }

  checkAllWithNarrative(): Promise<AppHealthReport & { narrative?: string }> {
    return this.appHealthService.checkAllWithNarrative();
  }
}
