import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Notification, NotificationDocument } from './schemas/notification.schema';
import { QlogService } from '../../common/qlog/qlog.service';

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
  recipientEmail?: string;
};

export interface EmailNotificationPayload {
  recipientEmail: string;
  subject: string;
  body: string;
  zoneId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @Optional() private readonly qlog?: QlogService,
  ) {}

  async notifyZoneManager(
    zoneId: string,
    message: string,
    extras: Partial<NotificationInput> = {},
  ): Promise<void> {
    this.qlog?.info(`Notification for zone ${zoneId}: ${message}`, 'NotificationsService', {
      zoneId,
      notificationType: 'ZONE_MANAGER',
      event: 'notification_sent',
    });

    await this.notificationModel.create({
      type: 'ZONE_MANAGER',
      target: `zone:${zoneId}`,
      zoneId,
      message,
      ...extras,
    });
  }

  async notifyAdmin(
    message: string,
    extras: Partial<NotificationInput> = {},
  ): Promise<void> {
    this.qlog?.info(`Admin notification: ${message}`, 'NotificationsService', {
      notificationType: 'ADMIN',
      event: 'notification_sent',
    });

    await this.notificationModel.create({
      type: 'ADMIN',
      target: 'admin',
      message,
      ...extras,
    });
  }

  async findRecent(zoneId?: string, limit = 50): Promise<NotificationDocument[]> {
    const query = zoneId ? { zoneId } : {};
    return this.notificationModel.find(query).sort({ createdAt: -1 }).limit(limit).exec();
  }

  /**
   * Prepares and stages an email notification for a zone manager or administrator.
   * Ready to be plugged into an SMTP or transactional email transport service (SendGrid, SES, Nodemailer).
   */
  async prepareEmailAlert(payload: EmailNotificationPayload): Promise<void> {
    this.qlog?.info(`Email notification prepared for ${payload.recipientEmail}`, 'NotificationsService', {
      event: 'email_alert_prepared',
      recipient: payload.recipientEmail,
      subject: payload.subject,
      zoneId: payload.zoneId,
      metadata: payload.metadata,
    });
  }
}
