import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JobsOptions, Queue, Worker } from 'bullmq';
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
  ) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

    this.producerConnection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    this.workerConnection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    this.queue = new Queue(this.queueName, {
      connection: this.producerConnection,
      defaultJobOptions: this.defaultJobOptions,
    });

    this.worker = new Worker(
      this.queueName,
      async (job) => {
        const result = await this.processDomainEvent(job.data);
        this.logger.log(`[EVENT PROCESSED] job=${job.name} id=${job.id}`);

        this.websocketBroadcastGateway.broadcastExternalEvent(job.data);
        this.logger.log(`[EVENT BROADCAST] channel=external.event jobId=${job.id}`);

        for (const socketEvent of result.socketEvents) {
          this.websocketBroadcastGateway.broadcastEvent(socketEvent.event, socketEvent.payload);
          this.logger.log(`[EVENT BROADCAST] channel=${socketEvent.event} jobId=${job.id}`);
        }

        if (result.mapUpdate) {
          this.websocketBroadcastGateway.broadcastMapUpdate(result.mapUpdate);
          this.logger.log(`[EVENT BROADCAST] channel=map.updated jobId=${job.id}`);
        }

        this.logger.log(`[BULLMQ BROADCAST] job=${job.name} id=${job.id}`);
      },
      {
        connection: this.workerConnection,
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `[EVENT FAILED] ` +
        `[BULLMQ FAILED] job=${job?.name} id=${job?.id} reason=${err.message}`,
      );
    });

    this.worker.on('error', (err) => {
      this.logger.error(`[BULLMQ ERROR] ${err.message}`);
    });

    this.logger.log(`BullMQ initialized on queue ${this.queueName} using ${redisUrl}`);
  }

  async enqueueExternalEvent(payload: unknown): Promise<void> {
    if (!this.queue) {
      throw new Error('BullMQ queue is not initialized yet');
    }

    try {
      const job = await this.queue.add('external.event', payload);
      this.logger.log(`[BULLMQ PRODUCER] Enqueued job id=${job.id}`);
    } catch (error) {
      this.logger.error(`[BULLMQ PRODUCER ERROR] ${(error as Error).message}`);
      throw error;
    }
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
      const payload = this.toNewContractPayload(envelope.businessPayload);

      if (!payload) {
        this.logger.warn(`[BULLMQ PROCESS] Invalid contracts.new payload: ${JSON.stringify(rawData)}`);
        return { socketEvents: [], mapUpdate: null };
      }

      return this.contractConsumer.handleNewContractEvent(payload);
    }

    if (eventType === 'contracts.cancel') {
      const payload = this.toCancelContractPayload(envelope.businessPayload);

      if (!payload) {
        this.logger.warn(
          `[BULLMQ PROCESS] Invalid contracts.cancel payload: ${JSON.stringify(rawData)}`,
        );
        return { socketEvents: [], mapUpdate: null };
      }

      return this.contractConsumer.handleCancelContractEvent(payload);
    }

    if (eventType === 'reclamations.new') {
      const payload = this.toNewReclamationPayload(envelope.businessPayload);

      if (!payload) {
        this.logger.warn(
          `[BULLMQ PROCESS] Invalid reclamations.new payload: ${JSON.stringify(rawData)}`,
        );
        return { socketEvents: [], mapUpdate: null };
      }

      return this.reclamationConsumer.handleNewReclamationEvent(payload);
    }

    if (eventType === 'nro.new') {
      const payload = this.toNewNroPayload(envelope.businessPayload);

      if (!payload) {
        this.logger.warn(`[BULLMQ PROCESS] Invalid nro.new payload: ${JSON.stringify(rawData)}`);
        return { socketEvents: [], mapUpdate: null };
      }

      return this.nroConsumer.handleNewNroEvent(payload);
    }

    if (eventType === 'nro.update') {
      const payload = this.toUpdateNroPayload(envelope.businessPayload);

      if (!payload) {
        this.logger.warn(`[BULLMQ PROCESS] Invalid nro.update payload: ${JSON.stringify(rawData)}`);
        return { socketEvents: [], mapUpdate: null };
      }

      return this.nroConsumer.handleUpdateNroEvent(payload);
    }

    if (eventType === 'nro.delete') {
      const payload = this.toDeleteNroPayload(envelope.businessPayload);

      if (!payload) {
        this.logger.warn(`[BULLMQ PROCESS] Invalid nro.delete payload: ${JSON.stringify(rawData)}`);
        return { socketEvents: [], mapUpdate: null };
      }

      return this.nroConsumer.handleDeleteNroEvent(payload);
    }

    if (eventType === 'fdt.new') {
      const payload = this.toNewFdtPayload(envelope.businessPayload);

      if (!payload) {
        this.logger.warn(`[BULLMQ PROCESS] Invalid fdt.new payload: ${JSON.stringify(rawData)}`);
        return { socketEvents: [], mapUpdate: null };
      }

      return this.fdtConsumer.handleNewFdtEvent(payload);
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
    const bandwidth = this.readNumber(data, ['bandwidth', 'forfait']) ?? 0;

    if (!externalId || latitude === null || longitude === null) {
      return null;
    }

    return {
      externalId,
      phoneNumber: phoneNumber ?? undefined,
      cin: cin ?? undefined,
      latitude,
      longitude,
      bandwidth,
    };
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
    const latitude =
      this.readNumber(data, ['latitude', 'lat']) ?? this.readNumber(location, ['latitude', 'lat']);
    const longitude =
      this.readNumber(data, ['longitude', 'lng', 'lon']) ??
      this.readNumber(location, ['longitude', 'lng', 'lon']);

    if (!externalId || !type || latitude === null || longitude === null) {
      return null;
    }

    return {
      externalId,
      phoneNumber: phoneNumber ?? undefined,
      cin: cin ?? undefined,
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