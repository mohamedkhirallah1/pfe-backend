import { Body, Controller, Get, Logger, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { AppRole } from '../auth/roles.enum';
import { MapService } from '../map/map.service';
import { EventsService, InboundEventType } from './events.service';

type DebugResponse = {
  status: 'success';
  route: string;
  received: true;
  timestamp: string;
};

@Controller('debug')
export class DebugController {
  private readonly logger = new Logger(DebugController.name);

  constructor(
    private readonly mapService: MapService,
    private readonly eventsService: EventsService,
  ) {}

  private buildResponse(route: string): DebugResponse {
    return {
      status: 'success',
      route,
      received: true,
      timestamp: new Date().toISOString(),
    };
  }

  private async dispatchDebugEvent(
    route: string,
    eventType: InboundEventType,
    payload: Record<string, unknown>,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.eventsService.dispatchInternalEvent(route, eventType, payload, 'debug-controller');
      return { ok: true };
    } catch (error) {
      this.logger.error(`[EVENT FAILED] debug-dispatch route=${route} reason=${(error as Error).message}`);
      return { ok: false, error: (error as Error).message };
    }
  }

  @Get('ping')
  ping(@Req() req: Request): DebugResponse {
    this.logger.log(`ROUTE HIT: ${req.url}`);
    this.logger.log('BODY: {}');
    return this.buildResponse('/api/debug/ping');
  }

  @Post('test-event')
  async testEvent(
    @Req() req: Request,
    @Body() body: { eventType?: string; payload?: Record<string, unknown> },
  ): Promise<DebugResponse> {
    this.logger.log(`ROUTE HIT: ${req.url}`);
    this.logger.log(`BODY: ${JSON.stringify(body)}`);

    const defaultPayload = {
      externalId: `debug-contract-${Date.now()}`,
      phoneNumber: '20111222',
      cin: '12345678',
      location: { latitude: 36.8065, longitude: 10.1815 },
      bandwidth: 50,
    };

    const validated = this.eventsService.validateInboundEvent({
      eventType: body.eventType ?? 'NEW_CONTRACT',
      payload: body.payload ?? defaultPayload,
    });

    await this.dispatchDebugEvent('/api/debug/test-event', validated.eventType, validated.payload);

    return this.buildResponse('/api/debug/test-event');
  }

  @Post('test-nro')
  async testNro(@Req() req: Request): Promise<DebugResponse> {
    this.logger.log(`ROUTE HIT: ${req.url}`);
    this.logger.log('BODY: {}');

    await this.dispatchDebugEvent('/api/debug/test-nro', 'NEW_NRO', {
      nroId: `debug-nro-${Date.now()}`,
      name: 'Debug NRO',
      regionName: 'Tunis',
      location: { latitude: 36.8065, longitude: 10.1815 },
      maxCapacity: 600,
    });

    return this.buildResponse('/api/debug/test-nro');
  }

  @Post('test-contract')
  async testContract(@Req() req: Request): Promise<DebugResponse> {
    this.logger.log(`ROUTE HIT: ${req.url}`);
    this.logger.log('BODY: {}');

    await this.dispatchDebugEvent('/api/debug/test-contract', 'NEW_CONTRACT', {
      externalId: `debug-contract-${Date.now()}`,
      phoneNumber: '20999888',
      cin: '87654321',
      location: { latitude: 36.8189, longitude: 10.1658 },
      bandwidth: 120,
    });

    return this.buildResponse('/api/debug/test-contract');
  }

  @Get('network')
  async network(@Req() req: Request): Promise<Record<string, unknown>> {
    this.logger.log(`ROUTE HIT: ${req.url}`);
    this.logger.log('BODY: {}');

    const port = Number(process.env.PORT ?? 3001);
    const host = process.env.HOST ?? '0.0.0.0';

    const validationProbe = this.eventsService.validateInboundEvent({
      eventType: 'NEW_NRO',
      payload: {
        nroId: 'debug-probe',
        name: 'debug-probe',
        location: { latitude: 36.8, longitude: 10.18 },
      },
    });

    return {
      status: 'success',
      route: '/api/debug/network',
      received: true,
      timestamp: new Date().toISOString(),
      server: {
        host,
        port,
      },
      request: {
        ip: req.ip ?? req.socket?.remoteAddress,
        origin: req.headers.origin ?? '(no-origin-header)',
        headers: req.headers,
      },
      requestTrace: {
        method: req.method,
        url: req.url,
      },
      checks: {
        apiPrefixStrict: true,
        selfHttpCallsDisabled: true,
        validatedEventType: validationProbe.eventType,
        queueRetryPolicy: '3 attempts with linear backoff (service) + BullMQ attempts/backoff',
      },
      note: 'No localhost self-calls are executed. Use external caller to hit /api/events and /api/health.',
    };
  }

  @Post('e2e-map')
  async e2eMap(@Req() req: Request): Promise<Record<string, unknown>> {
    this.logger.log(`ROUTE HIT: ${req.url}`);
    this.logger.log('BODY: {}');

    const now = Date.now();
    const nroId = `debug-e2e-nro-${now}`;
    const contractId = `debug-e2e-contract-${now}`;

    const sendNro = await this.dispatchDebugEvent('/api/debug/e2e-map', 'NEW_NRO', {
      nroId,
      name: 'Debug E2E NRO Bizerte',
      regionName: 'Bizerte',
      location: { latitude: 37.2744, longitude: 9.8739 },
      maxCapacity: 650,
    });

    const sendContract = await this.dispatchDebugEvent('/api/debug/e2e-map', 'NEW_CONTRACT', {
      externalId: contractId,
      phoneNumber: '21112233',
      cin: '99887766',
      location: { latitude: 37.2745, longitude: 9.8741 },
      bandwidth: 80,
    });

    const adminUser = { sub: 'debug', role: AppRole.ADMIN as const, zoneId: undefined };

    await new Promise((resolve) => setTimeout(resolve, 1200));

    const [nros, contracts] = await Promise.all([
      this.mapService.getNros(adminUser),
      this.mapService.getContracts(adminUser),
    ]);

    const nroVisible = nros.some((nro) => nro.externalId === nroId);
    const contractVisible = contracts.some((contract) => contract.externalId === contractId);

    return {
      status: 'success',
      route: '/api/debug/e2e-map',
      received: true,
      timestamp: new Date().toISOString(),
      events: {
        sendNro,
        sendContract,
      },
      visibility: {
        nroVisible,
        contractVisible,
      },
      ids: {
        nroId,
        contractId,
      },
    };
  }
}
