import {
  BadRequestException,
  Body,
  Controller,
  InternalServerErrorException,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { EventsService, InboundEventType } from './events.service';

type EventResponse = {
  status: 'success';
  route: string;
  received: true;
  eventType: string;
  timestamp: string;
};

@Controller()
export class EventsController {
  private readonly logger = new Logger(EventsController.name);

  constructor(private readonly eventsService: EventsService) {}

  private buildResponse(route: string, eventType: string): EventResponse {
    return {
      status: 'success',
      route,
      received: true,
      eventType,
      timestamp: new Date().toISOString(),
    };
  }

  private async forwardEvent(
    route: string,
    eventType: InboundEventType,
    payload: Record<string, unknown>,
  ): Promise<EventResponse> {
    await this.eventsService.dispatchInternalEvent(route, eventType, payload, 'external-system');

    return this.buildResponse(route, eventType);
  }

  @Post('events')
  async receiveEvent(@Req() req: Request, @Body() body: Record<string, unknown>): Promise<EventResponse> {
    try {
      this.logger.log(`ROUTE HIT: ${req.url}`);
      this.logger.log(`BODY: ${JSON.stringify(body)}`);

      const { eventType, payload } = this.eventsService.validateInboundEvent(body);

      if (eventType === 'TEST') {
        this.logger.log(`[EVENT RECEIVED] route=/api/events type=${eventType} payload=${JSON.stringify(payload)}`);
        return this.buildResponse('/api/events', eventType);
      }

      return this.forwardEvent('/api/events', eventType, payload);
    } catch (error) {
      this.logger.error(`EVENT ERROR: ${(error as Error).message}`, (error as Error).stack);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Event reception failed');
    }
  }

  @Post('contract/new')
  async newContract(@Req() req: Request, @Body() body: unknown): Promise<EventResponse> {
    try {
      this.logger.log(`ROUTE HIT: ${req.url}`);
      this.logger.log(`BODY: ${JSON.stringify(body)}`);
      this.logger.log('[EVENT RECEIVED] CONTRACT RECEIVED');
      const payload = this.eventsService.validateDirectPayload('/api/contract/new', body);
      return this.forwardEvent('/api/contract/new', 'NEW_CONTRACT', payload);
    } catch (error) {
      this.logger.error(`EVENT ERROR: ${(error as Error).message}`, (error as Error).stack);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Event reception failed');
    }
  }

  @Post('contract/cancel')
  async cancelContract(@Req() req: Request, @Body() body: unknown): Promise<EventResponse> {
    try {
      this.logger.log(`ROUTE HIT: ${req.url}`);
      this.logger.log(`BODY: ${JSON.stringify(body)}`);
      const payload = this.eventsService.validateDirectPayload('/api/contract/cancel', body);
      return this.forwardEvent('/api/contract/cancel', 'CANCEL_CONTRACT', payload);
    } catch (error) {
      this.logger.error(`EVENT ERROR: ${(error as Error).message}`, (error as Error).stack);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Event reception failed');
    }
  }

  @Post('nro/new')
  async newNro(@Req() req: Request, @Body() body: unknown): Promise<EventResponse> {
    try {
      this.logger.log(`ROUTE HIT: ${req.url}`);
      this.logger.log(`BODY: ${JSON.stringify(body)}`);
      this.logger.log('[EVENT RECEIVED] NRO RECEIVED');
      const payload = this.eventsService.validateDirectPayload('/api/nro/new', body);
      return this.forwardEvent('/api/nro/new', 'NEW_NRO', payload);
    } catch (error) {
      this.logger.error(`EVENT ERROR: ${(error as Error).message}`, (error as Error).stack);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Event reception failed');
    }
  }

  @Post('reclamation/new')
  async newReclamation(@Req() req: Request, @Body() body: unknown): Promise<EventResponse> {
    try {
      this.logger.log(`ROUTE HIT: ${req.url}`);
      this.logger.log(`BODY: ${JSON.stringify(body)}`);
      const payload = this.eventsService.validateDirectPayload('/api/reclamation/new', body);
      return this.forwardEvent('/api/reclamation/new', 'NEW_RECLAMATION', payload);
    } catch (error) {
      this.logger.error(`EVENT ERROR: ${(error as Error).message}`, (error as Error).stack);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Event reception failed');
    }
  }
}
