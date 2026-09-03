import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  InfrastructureCandidate,
  InfrastructureProposalAnalysis,
  InfrastructureProposalSimulation,
  InfrastructureType,
  Priority,
  RecommendationAction,
} from '../../interfaces/analysis.types';

export type RecommendationDocument = HydratedDocument<AiRecommendation>;

export enum RecommendationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  DISMISSED = 'DISMISSED',
}

// toJSON.virtuals adds a string `id` field alongside `_id` on every serialized response — purely
// additive (Mongoose already exposes the `id` virtual internally, this just includes it when the
// controller returns the document as JSON), needed so Flutter can read a plain `id` field.
@Schema({ timestamps: true, collection: 'ai_recommendations', toJSON: { virtuals: true } })
export class AiRecommendation {
  @Prop({ required: true, enum: Object.values(RecommendationAction) })
  action!: RecommendationAction;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  reason!: string;

  @Prop({ required: true })
  expectedImpact!: string;

  @Prop({ required: true, enum: Object.values(Priority) })
  priority!: Priority;

  @Prop({ required: true })
  confidence!: number;

  @Prop({ required: true })
  affectedArea!: string;

  @Prop({ required: false, index: true })
  zoneId?: string;

  @Prop({ required: true })
  estimatedDifficulty!: string;

  @Prop({ required: false })
  businessImpact?: string;

  @Prop({ required: false })
  technicalImpact?: string;

  @Prop({ required: false })
  risk?: string;

  @Prop({ required: false })
  estimatedCost?: string;

  @Prop({ required: false })
  estimatedEffort?: string;

  @Prop({ type: [String], default: [] })
  alternatives?: string[];

  @Prop({ required: false })
  expectedImprovement?: string;

  @Prop({ required: true, enum: Object.values(RecommendationStatus), default: RecommendationStatus.PENDING })
  status!: RecommendationStatus;

  @Prop({ required: false })
  sourceAgent?: string;

  /** Memory of the administrator decision — this is what closes the observe/decide/wait-for-validation loop. */
  @Prop({ required: false })
  reviewedAt?: Date;

  @Prop({ required: false })
  reviewNote?: string;

  // ---- Infrastructure proposal fields (InfrastructurePlannerAgent) — additive, optional. A
  // plain zone/topology/complaint recommendation never sets these. ----
  @Prop({ required: false })
  type?: 'INFRASTRUCTURE_PROPOSAL';

  @Prop({ required: false, enum: ['NRO', 'FDT'], index: true })
  infrastructureType?: InfrastructureType;

  @Prop({ required: false })
  centraleId?: string;

  @Prop({ required: false, index: true })
  sourceInfrastructureId?: string;

  @Prop({ type: Object, required: false })
  recommendedLocation?: { latitude: number; longitude: number };

  @Prop({ required: false })
  locationScore?: number;

  @Prop({ type: Object, required: false })
  analysis?: InfrastructureProposalAnalysis;

  @Prop({ type: Object, required: false })
  simulation?: InfrastructureProposalSimulation;

  @Prop({ type: [Object], required: false })
  candidates?: InfrastructureCandidate[];

  @Prop({ required: false, enum: ['groq', 'deterministic'] })
  source?: 'groq' | 'deterministic';
}

export const AiRecommendationSchema = SchemaFactory.createForClass(AiRecommendation);
AiRecommendationSchema.index({ zoneId: 1, createdAt: -1 });
AiRecommendationSchema.index({ status: 1 });
AiRecommendationSchema.index({ infrastructureType: 1, createdAt: -1 });
