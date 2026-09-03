import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { AlertSource, RiskLevel } from '../../interfaces/analysis.types';

export type AlertDocument = HydratedDocument<AiAlert>;

@Schema({ timestamps: true, collection: 'ai_alerts' })
export class AiAlert {
  @Prop({ required: true, enum: Object.values(AlertSource), index: true })
  source!: AlertSource;

  @Prop({ required: true, enum: Object.values(RiskLevel) })
  severity!: RiskLevel;

  @Prop({ required: true })
  message!: string;

  @Prop({ required: false, index: true })
  zoneId?: string;

  @Prop({ required: false, index: true })
  entityId?: string;

  @Prop({ required: true, default: true })
  active!: boolean;

  @Prop({ required: false })
  resolvedAt?: Date;
}

export const AiAlertSchema = SchemaFactory.createForClass(AiAlert);
AiAlertSchema.index({ source: 1, entityId: 1, active: 1 });
