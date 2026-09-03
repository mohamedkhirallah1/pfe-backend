import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { RiskLevel } from '../../interfaces/analysis.types';

export type ExecutiveReportDocument = HydratedDocument<ExecutiveReport>;

@Schema({ timestamps: true, collection: 'ai_executive_reports' })
export class ExecutiveReport {
  @Prop({ required: true })
  networkScore!: number;

  @Prop({ required: true, enum: Object.values(RiskLevel) })
  risk!: RiskLevel;

  @Prop({ type: Object, required: true })
  zoneRanking!: Array<{ zoneId: string; zoneName: string; healthScore: number; risk: RiskLevel }>;

  @Prop({ type: Object, required: true })
  criticalZones!: string[];

  @Prop({ type: Object, required: true })
  topRecommendations!: unknown[];

  @Prop({ type: Object, required: true })
  predictedSaturation!: unknown[];

  @Prop({ type: Object, required: true })
  complaintSummary!: Record<string, unknown>;

  @Prop({ type: Object, required: true })
  infrastructureEvolution!: Record<string, unknown>;

  @Prop({ required: true })
  narrative!: string;

  @Prop({ required: true, default: 0 })
  confidence!: number;

  /** Diagnostic only, additive — lets an admin/log-reader tell at a glance whether `narrative`
   *  came from Groq or the deterministic fallback template, without having to infer it from
   *  `confidence`. Never affects report generation/persistence itself. */
  @Prop({ required: false, enum: ['groq', 'fallback'] })
  aiProvider?: 'groq' | 'fallback';

  /** GLOBAL = ADMIN's all-zones report; ZONE = one RESPONSABLE_ZONE's own-zone report.
   *  Defaults to GLOBAL for backward compatibility with reports created before this field existed. */
  @Prop({ required: true, enum: ['GLOBAL', 'ZONE'], default: 'GLOBAL' })
  scope!: 'GLOBAL' | 'ZONE';

  @Prop({ required: false })
  zoneId?: string;

  @Prop({ required: false })
  zoneName?: string;
}

export const ExecutiveReportSchema = SchemaFactory.createForClass(ExecutiveReport);
