import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { AnomalyEntityType, AnomalySeverity, AnomalyStatus, AnomalyType, AnomalyFactor } from '../../types/anomaly.types';

export type AnomalyResultDocument = HydratedDocument<AnomalyResult>;

@Schema({ timestamps: true, collection: 'ai_anomaly_results' })
export class AnomalyResult {
  @Prop({ required: true, enum: Object.values(AnomalyEntityType), index: true })
  entityType!: AnomalyEntityType;

  @Prop({ required: true, index: true })
  entityId!: string;

  @Prop({ required: false, index: true })
  entityName?: string;

  @Prop({ required: false, index: true })
  zoneId?: string;

  @Prop({ required: true, enum: Object.values(AnomalyType), index: true })
  anomalyType!: AnomalyType;

  @Prop({ type: [String], default: [] })
  anomalyTypes!: AnomalyType[];

  @Prop({ required: true, enum: Object.values(AnomalySeverity), index: true })
  severity!: AnomalySeverity;

  @Prop({ required: true })
  anomalyScore!: number;

  @Prop({ required: true })
  confidenceScore!: number;

  @Prop({ required: true })
  currentValue!: number;

  @Prop({ required: true })
  historicalMean!: number;

  @Prop({ required: true })
  historicalStdDev!: number;

  @Prop({ required: true })
  deviation!: number;

  @Prop({ required: true })
  growthRate!: number;

  @Prop({ required: true })
  acceleration!: number;

  @Prop({ type: [Object], default: [] })
  factors!: AnomalyFactor[];

  @Prop({ required: true, enum: Object.values(AnomalyStatus), index: true })
  status!: AnomalyStatus;

  @Prop({ required: true, index: true })
  detectedAt!: Date;

  @Prop({ required: true })
  explanation!: string;

  @Prop({ required: true })
  recommendation!: string;

  @Prop({ required: true })
  modelVersion!: string;

  @Prop({ required: true, index: true })
  executionId!: string;

  @Prop({ required: false, index: true })
  correlationId?: string;

  @Prop({ required: false })
  reviewedAt?: Date;

  @Prop({ required: false })
  reviewNote?: string;

  @Prop({ required: false })
  insufficientDataReason?: string;

  @Prop({ required: true, index: true })
  fingerprint!: string;
}

export const AnomalyResultSchema = SchemaFactory.createForClass(AnomalyResult);
AnomalyResultSchema.index({ zoneId: 1, status: 1, detectedAt: -1 });
AnomalyResultSchema.index({ entityType: 1, entityId: 1, anomalyType: 1, status: 1 });
AnomalyResultSchema.index({ fingerprint: 1 }, { unique: true, partialFilterExpression: { status: AnomalyStatus.DETECTED } });
