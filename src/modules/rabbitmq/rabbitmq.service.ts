import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { JobsOptions, Queue, Worker } from 'bullmq';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import IORedis from 'ioredis';
import { CancelContractEventDto } from '../contracts/dto/cancel-contract-event.dto';
import { NewContractEventDto } from '../contracts/dto/new-contract-event.dto';
import { NewFdtEventDto } from '../fdt/dto/new-fdt-event.dto';
import { DeleteNroEventDto } from '../nro/dto/delete-nro-event.dto';
import { NewNroEventDto } from '../nro/dto/new-nro-event.dto';
import { UpdateNroEventDto } from '../nro/dto/update-nro-event.dto';
import { NewReclamationEventDto } from '../reclamations/dto/new-reclamation-event.dto';
import { ContractConsumer } from './consumers/contract.consumer';
import { FdtConsumer } from './consumers/fdt.consumer';
import { NroConsumer } from './consumers/nro.consumer';
import { ReclamationConsumer } from './consumers/reclamation.consumer';
import { DomainProcessResult, SocketEmission } from './rabbitmq.types';
import { WebsocketBroadcastGateway } from '../websocket-server/websocket-broadcast.gateway';
import { QlogService } from '../../common/qlog/qlog.service';

@Injectable()
export class RabbitMqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private readonly queueName = 'external-events';
  private producerConnection?: IORedis;
  private workerConnection?: IORedis;
  private queue?: Queue;
  private worker?: Worker;

  private readonly defaultJobOptions: JobsOptions = {
    attempts: 3,
    removeOnComplete: 100,
    removeOnFail: 100,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  };

  constructor(
    private readonly websocketBroadcastGateway: WebsocketBroadcastGateway,
    private readonly contractConsumer: ContractConsumer,
    private readonly reclamationConsumer: ReclamationConsumer,
    private readonly nroConsumer: NroConsumer,
    private readonly fdtConsumer: FdtConsumer,
    @Optional() private readonly qlog?: QlogService,
  ) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

    this.producerConnection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    // An ioredis client with no 'error' listener crashes the process on connection errors
    // (unhandled 'error' event) instead of just logging and letting ioredis's own retry kick in.
    this.producerConnection.on('error', (err) => {
      this.qlog?.error(`[Redis Producer Error] ${err.message}`, err.stack, 'RabbitMqService', {
        component: 'redis',
        role: 'producer',
        event: 'connection_error',
      });
    });
    this.producerConnection.on('connect', () => {
      this.qlog?.info('Redis producer connection established', 'RabbitMqService', {
        component: 'redis',
        role: 'producer',
        event: 'connected',
      });
    });

    this.workerConnection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    this.workerConnection.on('error', (err) => {
      this.qlog?.error(`[Redis Worker Error] ${err.message}`, err.stack, 'RabbitMqService', {
        component: 'redis',
        role: 'worker',
        event: 'connection_error',
      });
    });
    this.workerConnection.on('connect', () => {
      this.qlog?.info('Redis worker connection established', 'RabbitMqService', {
        component: 'redis',
        role: 'worker',
        event: 'connected',
      });
    });

    this.queue = new Queue(this.queueName, {
      connection: this.producerConnection,
      defaultJobOptions: this.defaultJobOptions,
    });

    this.worker = new Worker(
      this.queueName,
      async (job) => {
        const jobStartTime = Date.now();
        this.qlog?.logBullMq({
          queueName: this.queueName,
          jobName: job.name,
          jobId: job.id,
          event: 'started',
          attempt: job.attemptsMade + 1,
        });

        // processDomainEvent already writes to MongoDB and its handlers are idempotent on retry
        // (upsert-by-externalId, or an early return when the entity is already in its target
        // state). Broadcasting to connected sockets is a best-effort side effect on top of that:
        // if it throws, we must not let BullMQ mark the job "failed" and retry it — the DB
        // mutation already happened, so a retry would only risk duplicate broadcasts, not fix
        // anything. Broadcast failures are logged, not rethrown.
        const result = await this.processDomainEvent(job.data);
        const durationMs = Date.now() - jobStartTime;
        this.qlog?.logBullMq({
          queueName: this.queueName,
          jobName: job.name,
          jobId: job.id,
          event: 'completed',
          durationMs,
          attempt: job.attemptsMade + 1,
        });

        try {
          this.websocketBroadcastGateway.broadcastExternalEvent(job.data);

          for (const socketEvent of result.socketEvents) {
            this.websocketBroadcastGateway.broadcastEvent(socketEvent.event, socketEvent.payload);
          }

          if (result.mapUpdate) {
            this.websocketBroadcastGateway.broadcastMapUpdate(result.mapUpdate);
          }
        } catch (error) {
          this.qlog?.error(
            `[Event Broadcast Failed] job=${job.name} id=${job.id} reason=${(error as Error).message}`,
            (error as Error).stack,
            'RabbitMqService',
            { jobId: job.id, jobName: job.name },
          );
        }
      },
      {
        connection: this.workerConnection,
      },
    );

    this.worker.on('failed', (job, err) => {
      this.qlog?.logBullMq({
        queueName: this.queueName,
        jobName: job?.name || 'unknown',
        jobId: job?.id,
        event: 'failed',
        attempt: job?.attemptsMade,
        error: err.message,
      });
    });

    this.worker.on('error', (err) => {
      this.qlog?.error(`[BullMQ Worker Error] ${err.message}`, err.stack, 'RabbitMqService', {
        component: 'bullmq',
        event: 'worker_error',
      });
    });

    this.qlog?.info(`BullMQ initialized on queue "${this.queueName}"`, 'RabbitMqService', {
      queueName: this.queueName,
      event: 'initialized',
    });
  }

  async enqueueExternalEvent(payload: unknown): Promise<void> {
    if (!this.queue) {
      throw new Error('BullMQ queue is not initialized yet');
    }

    try {
      const job = await this.queue.add('external.event', payload);
      this.qlog?.logBullMq({
        queueName: this.queueName,
        jobName: 'external.event',
        jobId: job.id,
        event: 'created',
      });
    } catch (error) {
      this.qlog?.error(
        `[BullMQ Producer Error] ${(error as Error).message}`,
        (error as Error).stack,
        'RabbitMqService',
        { event: 'enqueue_failed' },
      );
      throw error;
    }
  }

  /**
   * The toXxxPayload() extractors below tolerate loosely-shaped upstream data (multiple possible
   * key names, string/number coercion). Once they've produced a candidate object, this runs the
   * DTO's actual class-validator rules (enum values, string/number typing) before it reaches the
   * domain services — previously payloads were only cast `as Dto` with no real validation, so a
   * malformed value (e.g. an invalid typeClient) would only fail later as a Mongoose error, after
   * side effects (NRO capacity mutation) may already have happened.
   */
  private async validateEvent<T extends object>(
    dtoClass: new () => T,
    candidate: object,
  ): Promise<T | null> {
    const instance = plainToInstance(dtoClass, candidate);
    const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: false });

    if (errors.length > 0) {
      const details = errors.map((error) => ({
        property: error.property,
        constraints: error.constraints,
      }));
      this.logger.warn(`[BULLMQ VALIDATION] ${dtoClass.name} rejected: ${JSON.stringify(details)}`);
      return null;
    }

    return instance;
  }

  private async processDomainEvent(rawData: unknown): Promise<DomainProcessResult> {
    const rootData = this.toObject(rawData);
    const explicitEventTypeRaw = this.readString(rootData, ['eventType']);
    const explicitEventType = explicitEventTypeRaw
      ? this.resolveEventType({ eventType: explicitEventTypeRaw })
      : null;

    const envelope = this.extractEventEnvelope(rawData);
    const eventType = explicitEventType ?? this.resolveEventType(envelope.eventMeta);

    this.logger.log(
      `[BULLMQ PROCESS] eventType=${eventType ?? 'null'} explicit=${explicitEventTypeRaw ?? 'null'} raw=${JSON.stringify(rawData)}`,
    );

    if (!eventType) {
      this.logger.warn(`[BULLMQ PROCESS] Unknown event type: ${JSON.stringify(rawData)}`);
      return { socketEvents: [], mapUpdate: null };
    }

    if (eventType === 'contracts.new') {
      const candidate = this.toNewContractPayload(envelope.businessPayload);

      if (!candidate) {
        this.logger.warn(`[BULLMQ PROCESS] Invalid contracts.new payload: ${JSON.stringify(rawData)}`);
        return { socketEvents: [], mapUpdate: null };
      }

      const payload = await this.validateEvent(NewContractEventDto, candidate);
      if (!payload) {
        return { socketEvents: [], mapUpdate: null };
      }

      return this.contractConsumer.handleNewContractEvent(payload);
    }

    if (eventType === 'contracts.cancel') {
      const candidate = this.toCancelContractPayload(envelope.businessPayload);

      if (!candidate) {
        this.logger.warn(
          `[BULLMQ PROCESS] Invalid contracts.cancel payload: ${JSON.stringify(rawData)}`,
        );
        return { socketEvents: [], mapUpdate: null };
      }

      const payload = await this.validateEvent(CancelContractEventDto, candidate);
      if (!payload) {
        return { socketEvents: [], mapUpdate: null };
      }

      return this.contractConsumer.handleCancelContractEvent(payload);
    }

    if (eventType === 'reclamations.new') {
      const candidate = this.toNewReclamationPayload(envelope.businessPayload);

      if (!candidate) {
        this.logger.warn(
          `[BULLMQ PROCESS] Invalid reclamations.new payload: ${JSON.stringify(rawData)}`,
        );
        return { socketEvents: [], mapUpdate: null };
      }

      const payload = await this.validateEvent(NewReclamationEventDto, candidate);
      if (!payload) {
        return { socketEvents: [], mapUpdate: null };
      }

      return this.reclamationConsumer.handleNewReclamationEvent(payload);
    }

    if (eventType === 'nro.new') {
      const candidate = this.toNewNroPayload(envelope.businessPayload);

      if (!candidate) {
        this.logger.warn(`[BULLMQ PROCESS] Invalid nro.new payload: ${JSON.stringify(rawData)}`);
        return { socketEvents: [], mapUpdate: null };
      }

      const payload = await this.validateEvent(NewNroEventDto, candidate);
      if (!payload) {
        return { socketEvents: [], mapUpdate: null };
      }

      return this.nroConsumer.handleNewNroEvent(payload);
    }

    if (eventType === 'nro.update') {
      const candidate = this.toUpdateNroPayload(envelope.businessPayload);

      if (!candidate) {
        this.logger.warn(`[BULLMQ PROCESS] Invalid nro.update payload: ${JSON.stringify(rawData)}`);
        return { socketEvents: [], mapUpdate: null };
      }

      const payload = await this.validateEvent(UpdateNroEventDto, candidate);
      if (!payload) {
        return { socketEvents: [], mapUpdate: null };
      }

      return this.nroConsumer.handleUpdateNroEvent(payload);
    }

    if (eventType === 'nro.delete') {
      const candidate = this.toDeleteNroPayload(envelope.businessPayload);

      if (!candidate) {
        this.logger.warn(`[BULLMQ PROCESS] Invalid nro.delete payload: ${JSON.stringify(rawData)}`);
        return { socketEvents: [], mapUpdate: null };
      }

      const payload = await this.validateEvent(DeleteNroEventDto, candidate);
      if (!payload) {
        return { socketEvents: [], mapUpdate: null };
      }

      return this.nroConsumer.handleDeleteNroEvent(payload);
    }

    if (eventType === 'fdt.new') {
      const candidate = this.toNewFdtPayload(envelope.businessPayload);

      if (!candidate) {
        this.logger.warn(`[BULLMQ PROCESS] Invalid fdt.new payload: ${JSON.stringify(rawData)}`);
        return { socketEvents: [], mapUpdate: null };
      }

      const payload = await this.validateEvent(NewFdtEventDto, candidate);
      if (!payload) {
        return { socketEvents: [], mapUpdate: null };
      }

      return this.fdtConsumer.handleNewFdtEvent(payload);
    }

    if (eventType === 'topology.updated') {
      return {
        socketEvents: [
          { event: 'topology.updated', payload: envelope.businessPayload },
          { event: 'map.updated', payload: envelope.businessPayload },
        ],
        mapUpdate: envelope.businessPayload,
      };
    }

    return { socketEvents: [], mapUpdate: null };
  }

  private extractEventEnvelope(rawData: unknown): {
    eventMeta: Record<string, unknown>;
    businessPayload: Record<string, unknown>;
  } {
    const root = this.toObject(rawData);
    const level1 = this.toObject(root.payload);
    const level2 = this.toObject(level1.payload);

    const rootEventType = this.readString(root, ['type', 'eventType', 'event', 'queue']);

    if (Object.keys(level2).length > 0) {
      return {
        eventMeta: rootEventType ? root : level1,
        businessPayload: level2,
      };
    }

    if (Object.keys(level1).length > 0) {
      if (rootEventType) {
        return {
          eventMeta: root,
          businessPayload: level1,
        };
      }

      return {
        eventMeta: level1,
        businessPayload: level1,
      };
    }

    return {
      eventMeta: root,
      businessPayload: root,
    };
  }

  private unwrapPayload(data: unknown): Record<string, unknown> {
    if (!data || typeof data !== 'object') {
      return {};
    }

    const source = data as Record<string, unknown>;
    if (source.payload && typeof source.payload === 'object') {
      return source.payload as Record<string, unknown>;
    }

    return source;
  }

  private resolveEventType(data: Record<string, unknown>):
    | 'contracts.new'
    | 'contracts.cancel'
    | 'reclamations.new'
    | 'nro.new'
    | 'nro.update'
    | 'nro.delete'
    | 'fdt.new'
    | 'topology.updated'
    | null {
    const directRaw = this.readString(data, ['type', 'eventType', 'event', 'queue']);
    const nestedRaw = this.readString(this.unwrapPayload(data), ['type', 'eventType', 'event', 'queue']);

    const wrapperEvents = new Set(['external.event']);
    const raw =
      directRaw && !wrapperEvents.has(directRaw.toLowerCase()) ? directRaw : nestedRaw;

    if (!raw) {
      return null;
    }

    const value = raw.toLowerCase();

    if (
      ['contracts.new', 'new_contract', 'new.contract', 'contract.new', 'newcontract'].includes(
        value,
      )
    ) {
      return 'contracts.new';
    }

    if (
      ['contracts.cancel', 'cancel_contract', 'cancel.contract', 'contract.cancel'].includes(
        value,
      )
    ) {
      return 'contracts.cancel';
    }

    if (
      ['reclamations.new', 'new_reclamation', 'new.reclamation', 'reclamation.new'].includes(
        value,
      )
    ) {
      return 'reclamations.new';
    }

    if (['new_nro', 'nro.new', 'nro_created', 'new.nro'].includes(value)) {
      return 'nro.new';
    }

    if (['update_nro', 'nro.update', 'nro_updated', 'update.nro'].includes(value)) {
      return 'nro.update';
    }

    if (['delete_nro', 'nro.delete', 'nro_deleted', 'delete.nro'].includes(value)) {
      return 'nro.delete';
    }

    if (['new_fdt', 'fdt.new', 'fdt_created', 'new.fdt'].includes(value)) {
      return 'fdt.new';
    }

    if (
      [
        'topology_updated',
        'topology.updated',
        'topology_update',
        'topology.update',
        'topologyupdated',
      ].includes(value)
    ) {
      return 'topology.updated';
    }

    return null;
  }

  private toNewContractPayload(data: Record<string, unknown>): NewContractEventDto | null {
    const location = this.toObject(data.location);
    const externalId = this.readString(data, ['externalId', 'id', 'contractId']);
    const phoneNumber = this.readString(data, ['phoneNumber', 'phone']);
    const cin = this.readString(data, ['cin']);
    const latitude =
      this.readNumber(data, ['latitude', 'lat']) ?? this.readNumber(location, ['latitude', 'lat']);
    const longitude =
      this.readNumber(data, ['longitude', 'lng', 'lon']) ??
      this.readNumber(location, ['longitude', 'lng', 'lon']);

    // New required fields
    const numeroTelephone = this.readString(data, ['numeroTelephone', 'numero_telephone', 'telephone', 'phone', 'phoneNumber']);
    const numeroCIN = this.readString(data, ['numeroCIN', 'numero_cin', 'cin', 'cinNumber']);
    const offreGB = this.readNumber(data, ['offreGB', 'offre', 'packageGb', 'bandwidth', 'forfait']);
    const typeClient = this.readString(data, ['typeClient', 'clientType', 'type_client']);

    const bandwidth = this.readNumber(data, ['bandwidth', 'forfait']) ?? (offreGB ?? 0);

    // traceFDT may be provided as an array of coordinates
    let traceFDT: [number, number][] | undefined = undefined;
    const rawTrace = data['traceFDT'] ?? data['trace'] ?? data['path'];
    if (Array.isArray(rawTrace)) {
      try {
        const coords = rawTrace as unknown as Array<unknown>;
        if (coords.length > 0 && Array.isArray(coords[0])) {
          traceFDT = coords.map((c) => (c as any).map(Number)) as [number, number][];
        }
      } catch (e) {
        traceFDT = undefined;
      }
    }

    if (!externalId || latitude === null || longitude === null || !numeroTelephone || !numeroCIN || offreGB === null || !typeClient) {
      return null;
    }

    return {
      externalId,
      phoneNumber: phoneNumber ?? undefined,
      cin: cin ?? undefined,
      numeroTelephone,
      numeroCIN,
      latitude,
      longitude,
      bandwidth,
      offreGB,
      typeClient: typeClient as any,
      traceFDT,
    } as NewContractEventDto;
  }

  private toCancelContractPayload(data: Record<string, unknown>): CancelContractEventDto | null {
    const externalId = this.readString(data, ['externalId', 'id', 'contractId']);

    if (!externalId) {
      return null;
    }

    return { externalId };
  }

  private toNewReclamationPayload(data: Record<string, unknown>): NewReclamationEventDto | null {
    const location = this.toObject(data.location);
    const externalId = this.readString(data, ['externalId', 'id', 'reclamationId']);
    const phoneNumber = this.readString(data, ['phoneNumber', 'phone']);
    const cin = this.readString(data, ['cin']);
    const type = this.readString(data, ['type', 'issueType', 'category']);
    const numeroCIN = this.readString(data, ['numeroCIN', 'numero_cin', 'cin', 'cinNumber']);
    const latitude =
      this.readNumber(data, ['latitude', 'lat']) ?? this.readNumber(location, ['latitude', 'lat']);
    const longitude =
      this.readNumber(data, ['longitude', 'lng', 'lon']) ??
      this.readNumber(location, ['longitude', 'lng', 'lon']);

    if (!externalId || !type || !numeroCIN || latitude === null || longitude === null) {
      return null;
    }

    return {
      externalId,
      phoneNumber: phoneNumber ?? undefined,
      cin: cin ?? undefined,
      numeroCIN,
      type,
      latitude,
      longitude,
    };
  }

  private toNewNroPayload(data: Record<string, unknown>): NewNroEventDto | null {
    const location = this.toObject(data.location);
    const nroId = this.readString(data, ['nroId', 'id', 'externalId']);
    const name = this.readString(data, ['name']);
    const regionId = this.readString(data, ['regionId']);
    const regionName = this.readString(data, ['regionName']);
    const latitude =
      this.readNumber(data, ['latitude', 'lat']) ?? this.readNumber(location, ['latitude', 'lat']);
    const longitude =
      this.readNumber(data, ['longitude', 'lng', 'lon']) ??
      this.readNumber(location, ['longitude', 'lng', 'lon']);
    const maxCapacity = this.readNumber(data, ['maxCapacity', 'capacity']) ?? 600;

    if (!nroId || !name || latitude === null || longitude === null) {
      return null;
    }

    return {
      nroId,
      name,
      regionId: regionId ?? undefined,
      regionName: regionName ?? undefined,
      latitude,
      longitude,
      maxCapacity,
    };
  }

  private toUpdateNroPayload(data: Record<string, unknown>): UpdateNroEventDto | null {
    const location = this.toObject(data.location);
    const nroId = this.readString(data, ['nroId', 'id', 'externalId']);
    const name = this.readString(data, ['name']);
    const regionId = this.readString(data, ['regionId']);
    const regionName = this.readString(data, ['regionName']);
    const latitude =
      this.readNumber(data, ['latitude', 'lat']) ?? this.readNumber(location, ['latitude', 'lat']);
    const longitude =
      this.readNumber(data, ['longitude', 'lng', 'lon']) ??
      this.readNumber(location, ['longitude', 'lng', 'lon']);
    const maxCapacity = this.readNumber(data, ['maxCapacity', 'capacity']);

    if (!nroId) {
      return null;
    }

    return {
      nroId,
      name: name ?? undefined,
      regionId: regionId ?? undefined,
      regionName: regionName ?? undefined,
      latitude: latitude ?? undefined,
      longitude: longitude ?? undefined,
      maxCapacity: maxCapacity ?? undefined,
    };
  }

  private toDeleteNroPayload(data: Record<string, unknown>): DeleteNroEventDto | null {
    const nroId = this.readString(data, ['nroId', 'id', 'externalId']);

    if (!nroId) {
      return null;
    }

    return { nroId };
  }

  private toNewFdtPayload(data: Record<string, unknown>): NewFdtEventDto | null {
    const location = this.toObject(data.location);
    const externalId = this.readString(data, ['externalId', 'id', 'fdtId']);
    const nroId = this.readString(data, ['nroId']);
    const regionId = this.readString(data, ['regionId']);
    const latitude =
      this.readNumber(data, ['latitude', 'lat']) ?? this.readNumber(location, ['latitude', 'lat']);
    const longitude =
      this.readNumber(data, ['longitude', 'lng', 'lon']) ??
      this.readNumber(location, ['longitude', 'lng', 'lon']);

    if (!externalId || latitude === null || longitude === null) {
      return null;
    }

    return {
      externalId,
      nroId: nroId ?? undefined,
      regionId: regionId ?? undefined,
      latitude,
      longitude,
    };
  }

  private readString(
    data: Record<string, unknown>,
    keys: string[],
  ): string | null {
    for (const key of keys) {
      const value = data[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    return null;
  }

  private readNumber(data: Record<string, unknown>, keys: string[]): number | null {
    for (const key of keys) {
      const value = data[key];

      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }

      if (typeof value === 'string') {
        const parsed = Number(value);
        if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }

    return null;
  }

  private toObject(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object') {
      return value as Record<string, unknown>;
    }

    return {};
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();

    if (this.producerConnection) {
      await this.producerConnection.quit();
    }

    if (this.workerConnection) {
      await this.workerConnection.quit();
    }

    this.logger.log('BullMQ resources closed');
  }
}