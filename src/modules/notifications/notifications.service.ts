import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Notification, NotificationDocument } from './schemas/notification.schema';

type NotificationInput = {
  type: string;
  message: string;
  target: string;
  zoneId?: string;
  regionId?: string;
  eventType?: string;
  entityType?: string;
  externalId?: string;
  contractId?: string;
  nroId?: string;
  fdtId?: string;
  status?: string;
  latitude?: number;
  longitude?: number;
  coordinates?: [number, number];
  bandwidth?: number;
  phoneNumber?: string;
  cin?: string;
  rejectReason?: string;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  async notifyZoneManager(zoneId: string, message: string, extras: Partial<NotificationInput> = {}): Promise<void> {
    this.logger.log(`[ZONE ${zoneId}] ${message}`);
    await this.notificationModel.create({
      type: 'ZONE_MANAGER',
      target: `zone:${zoneId}`,
      zoneId,
      message,
      ...extras,
    });
  }

  async notifyAdmin(message: string, extras: Partial<NotificationInput> = {}): Promise<void> {
    this.logger.log(`[ADMIN] ${message}`);
    await this.notificationModel.create({
      type: 'ADMIN',
      target: 'admin',
      message,
      ...extras,
    });
  }

  async findRecent(zoneId?: string, limit = 50): Promise<NotificationDocument[]> {
    const query = zoneId ? { $or: [{ zoneId }, { target: 'admin' }] } : {};
    return this.notificationModel.find(query).sort({ createdAt: -1 }).limit(limit).exec();
  }
}
