import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NotificationsService } from '../../notifications/notifications.service';
import { WebsocketBroadcastGateway } from '../../websocket-server/websocket-broadcast.gateway';
import { Alert } from '../interfaces/analysis.types';
import { AiAlert, AlertDocument } from '../reports/schemas/alert.schema';

/**
 * Alert Engine: persists threshold-crossing alerts, deduplicating against any already-active
 * alert for the same (source, entityId) pair so a condition that stays true for hours doesn't
 * re-notify on every cron tick. Broadcasts new alerts over the same websocket channel other
 * modules already use, and notifies admins through the existing NotificationsService.
 */
@Injectable()
export class AlertEngineService {
  private readonly logger = new Logger(AlertEngineService.name);

  constructor(
    @InjectModel(AiAlert.name) private readonly alertModel: Model<AlertDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly websocketGateway: WebsocketBroadcastGateway,
  ) {}

  async raise(alerts: Alert[]): Promise<AlertDocument[]> {
    const raised: AlertDocument[] = [];

    for (const alert of alerts) {
      const existing = await this.alertModel
        .findOne({ source: alert.source, entityId: alert.entityId ?? null, active: true })
        .exec();

      if (existing) {
        continue;
      }

      const doc = await this.alertModel.create({ ...alert, active: true });
      raised.push(doc);

      const payload = {
        id: doc._id.toString(),
        source: doc.source,
        severity: doc.severity,
        message: doc.message,
        zoneId: doc.zoneId,
        entityId: doc.entityId,
      };

      // Zone-bound alerts (most of them) go only to that zone's room + admins — a
      // RESPONSABLE_ZONE of another zone must never receive it. Zone-less alerts (e.g.
      // APP_HEALTH, which has no zoneId) stay a global broadcast, unchanged.
      if (doc.zoneId) {
        this.websocketGateway.broadcastToZone('ai.alert', doc.zoneId, payload);
        await this.notificationsService.notifyZoneManager(doc.zoneId, `[AI ALERT] ${doc.message}`, {
          type: 'AI_ALERT',
          status: doc.severity,
          zoneId: doc.zoneId,
        });
      } else {
        this.websocketGateway.broadcastEvent('ai.alert', payload);
      }

      await this.notificationsService.notifyAdmin(`[AI ALERT] ${doc.message}`, {
        type: 'AI_ALERT',
        status: doc.severity,
        zoneId: doc.zoneId,
      });
    }

    if (raised.length > 0) {
      this.logger.warn(`Raised ${raised.length} new alert(s)`);
    }

    return raised;
  }

  /** Marks alerts of a source/entity resolved once the underlying condition clears. */
  async resolve(source: string, entityId?: string): Promise<void> {
    await this.alertModel.updateMany(
      { source, entityId: entityId ?? null, active: true },
      { active: false, resolvedAt: new Date() },
    );
  }

  findActive(zoneId?: string): Promise<AlertDocument[]> {
    const filter: Record<string, unknown> = { active: true };
    if (zoneId) filter.zoneId = zoneId;
    return this.alertModel.find(filter).sort({ createdAt: -1 }).exec();
  }
}
