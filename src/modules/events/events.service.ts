import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import { RabbitMqService } from '../rabbitmq/rabbitmq.service';
import { MetricsService } from '../../common/metrics/metrics.service';

export type InboundEventType =
  | 'NEW_CONTRACT'
  | 'UPDATE_CONTRACT'
  | 'CANCEL_CONTRACT'
  | 'NEW_NRO'
  | 'UPDATE_NRO'
  | 'DELETE_NRO'
  | 'NEW_FDT'
  | 'UPDATE_FDT'
  | 'DELETE_FDT'
  | 'NEW_CENTRALE'
  | 'UPDATE_CENTRALE'
  | 'DELETE_CENTRALE'
  | 'NEW_RECLAMATION'
  | 'TOPOLOGY_UPDATED'
  | 'TEST';

export type NormalizedEvent = {
  eventType: InboundEventType;
  payload: Record<string, unknown>;
  source: 'external-system' | 'debug-controller';
  timestamp: string;
};

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  private readonly allowedEventTypes = new Set<InboundEventType>([
    'NEW_CONTRACT',
    'UPDATE_CONTRACT',
    'CANCEL_CONTRACT',
    'NEW_NRO',
    'UPDATE_NRO',
    'DELETE_NRO',
    'NEW_FDT',
    'UPDATE_FDT',
    'DELETE_FDT',
    'NEW_CENTRALE',
    'UPDATE_CENTRALE',
    'DELETE_CENTRALE',
    'NEW_RECLAMATION',
    'TOPOLOGY_UPDATED',
    'TEST',
  ]);

  constructor(
    private readonly rabbitMqService: RabbitMqService,
    @Optional() private readonly metricsService?: MetricsService,
  ) {}

  async dispatchInternalEvent(
    route: string,
    eventType: InboundEventType,
    payload: Record<string, unknown>,
    source: 'external-system' | 'debug-controller' = 'external-system',
  ): Promise<NormalizedEvent> {
    const event: NormalizedEvent = {
      eventType,
      payload,
      source,
      timestamp: new Date().toISOString(),
    };

    this.logger.log(`[EVENT RECEIVED] route=${route} type=${eventType} source=${source}`);
    this.metricsService?.recordEventIngestion(eventType, 'success');
    await this.enqueueWithRetry(event, 3, 300);

    return event;
  }

  private hasValidLocation(payload: Record<string, unknown>): boolean {
    const nested = payload.location as Record<string, unknown> | undefined;

    const lat =
      typeof payload.latitude === 'number'
        ? payload.latitude
        : typeof nested?.latitude === 'number'
          ? nested.latitude
          : null;

    const lng =
      typeof payload.longitude === 'number'
        ? payload.longitude
        : typeof nested?.longitude === 'number'
          ? nested.longitude
          : null;

    return lat !== null && lng !== null;
  }

  validateInboundEvent(body: Record<string, unknown>): {
    eventType: InboundEventType;
    payload: Record<string, unknown>;
  } {
    const eventType = typeof body.eventType === 'string' ? (body.eventType as InboundEventType) : null;
    const payload = body.payload as Record<string, unknown> | undefined;

    if (!eventType || !payload) {
      throw new BadRequestException('eventType and payload are required');
    }

    if (!this.allowedEventTypes.has(eventType)) {
      this.logger.warn(`[EVENT FAILED] Unsupported eventType=${String(eventType)}`);
      throw new BadRequestException(`Unsupported eventType: ${String(eventType)}`);
    }

    if (eventType !== 'TEST' && Object.keys(payload).length === 0) {
      throw new BadRequestException('payload must not be empty');
    }

    const requiresLocation = ['NEW_CONTRACT', 'NEW_NRO', 'NEW_FDT', 'NEW_CENTRALE', 'NEW_RECLAMATION'];
    if (requiresLocation.includes(eventType)) {
      if (!this.hasValidLocation(payload)) {
        throw new BadRequestException('payload.location (latitude/longitude) is required');
      }
    }

    return { eventType, payload };
  }

  validateDirectPayload(route: string, payload: unknown): Record<string, unknown> {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException(`Invalid payload for route ${route}`);
    }

    const data = payload as Record<string, unknown>;
    if (Object.keys(data).length === 0) {
      throw new BadRequestException(`Payload is empty for route ${route}`);
    }

    if (route !== '/api/contract/cancel' && !this.hasValidLocation(data)) {
      throw new BadRequestException(`location (latitude/longitude) is required for route ${route}`);
    }

    return data;
  }

  private async enqueueWithRetry(
    event: NormalizedEvent,
    maxAttempts = 3,
    delayMs = 300,
  ): Promise<void> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.rabbitMqService.enqueueExternalEvent(event);
        return;
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `[EVENT ENQUEUE RETRY] attempt=${attempt}/${maxAttempts} error=${(error as Error).message}`,
        );

        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    this.logger.error(
      `[EVENT ENQUEUE FAILED] maxAttempts reached for eventType=${event.eventType}`,
      lastError instanceof Error ? lastError.stack : undefined,
    );
    throw lastError;
  }
}
