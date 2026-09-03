import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type NetworkSnapshotDocument = HydratedDocument<NetworkSnapshot>;

/**
 * Lightweight counters captured every 5 minutes (no LLM call) so the saturation-prediction
 * agent has real history to run a trend regression over instead of guessing from a single point.
 */
@Schema({ timestamps: true, collection: 'ai_network_snapshots' })
export class NetworkSnapshot {
  @Prop({ required: false, index: true })
  zoneId?: string; // absent = global snapshot

  @Prop({ required: false })
  nroExternalId?: string; // present for per-NRO saturation history

  @Prop({ required: false })
  fdtExternalId?: string; // present for per-FDT occupation history

  @Prop({ required: true })
  metric!: string; // e.g. 'nroAvgSaturationPct', 'fdtAvgOccupationPct', 'complaintCount24h'

  @Prop({ required: true })
  value!: number;
}

export const NetworkSnapshotSchema = SchemaFactory.createForClass(NetworkSnapshot);
NetworkSnapshotSchema.index({ zoneId: 1, nroExternalId: 1, metric: 1, createdAt: -1 });
