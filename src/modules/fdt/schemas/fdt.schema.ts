import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type FdtDocument = HydratedDocument<Fdt>;

export enum FdtStatus {
  ACTIVE = 'ACTIVE',
  SATURATED = 'SATURATED',
  DOWN = 'DOWN',
  MAINTENANCE = 'MAINTENANCE',
}

export enum FdtStatut {
  DISPONIBLE = 'DISPONIBLE',
  CHARGE = 'CHARGE',
  PLEIN = 'PLEIN',
}

export type FdtLocation = {
  type: 'Point';
  coordinates: [number, number];
};

@Schema({ timestamps: true, collection: 'fdts' })
export class Fdt {
  @Prop({ required: true, unique: true, index: true })
  externalId!: string;

  @Prop({ required: false, index: true })
  nroId?: string;

  @Prop({ type: Types.ObjectId, ref: 'Centrale', required: false, index: true })
  centraleId?: Types.ObjectId;

  @Prop({ required: false, index: true })
  regionId?: string;

  @Prop({
    type: {
      type: String,
      enum: ['Point'],
      required: true,
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      required: true,
    },
  })
  location!: FdtLocation;

  @Prop({ required: true, default: 128 })
  maxClients!: number;

  @Prop({ required: true, default: 0 })
  activeClients!: number;

  @Prop({ required: true, default: 0 })
  signalQuality!: number;

  @Prop({ required: true, enum: Object.values(FdtStatus), default: FdtStatus.ACTIVE })
  status!: FdtStatus;

  @Prop({ required: true, default: 32 })
  nbPortsTotal!: number;

  @Prop({ required: true, default: 0 })
  nbPortsUtilises!: number;

  @Prop({ required: true, enum: Object.values(FdtStatut), default: FdtStatut.DISPONIBLE })
  statutFdt!: FdtStatut;

  @Prop({ required: false })
  createdBy?: string;

  @Prop({ required: false })
  createdByRole?: string;

  @Prop({ required: false })
  createdByEmail?: string;

  @Prop({ required: true, default: Date.now })
  createdAt!: Date;

  // Virtual computed field
  get utilizationRate(): number {
    if (this.maxClients === 0) return 0;
    return (this.activeClients / this.maxClients) * 100;
  }
}

export const FdtSchema = SchemaFactory.createForClass(Fdt);
FdtSchema.index({ location: '2dsphere' });
FdtSchema.index({ nroId: 1 });
FdtSchema.index({ centraleId: 1 });
FdtSchema.index({ status: 1 });
