import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { RabbitMqService } from '../rabbitmq/rabbitmq.service';

export type InboundEventType =
  | 'NEW_CONTRACT'
  | 'NEW_NRO'
  | 'CANCEL_CONTRACT'
  | 'NEW_RECLAMATION'
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
    'NEW_NRO',
    'CANCEL_CONTRACT',
    'NEW_RECLAMATION',
    'TEST',
  ]);

  constructor(private readonly rabbitMqService: RabbitMqService) {}

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

    if (eventType === 'NEW_CONTRACT' || eventType === 'NEW_NRO' || eventType === 'NEW_RECLAMATION') {
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

  async enqueueWithRetry(event: NormalizedEvent, retries = 3, baseDelayMs = 300): Promise<void> {
    let attempt = 0;

    while (attempt < retries) {
      attempt += 1;
      try {
        await this.rabbitMqService.enqueueExternalEvent(event);
        this.logger.log(`[EVENT QUEUED] type=${event.eventType} attempt=${attempt}`);
        return;
      } catch (error) {
        const message = (error as Error).message;
        this.logger.error(`[EVENT FAILED] queue type=${event.eventType} attempt=${attempt} error=${message}`);

        if (attempt >= retries) {
          throw error;
        }

        const delay = baseDelayMs * attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
}
