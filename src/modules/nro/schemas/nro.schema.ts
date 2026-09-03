import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type NroDocument = HydratedDocument<Nro>;

export enum NroStatus {
  ACTIVE = 'ACTIVE',
  SATURATED = 'SATURATED',
  DOWN = 'DOWN',
  DELETED = 'DELETED',
}

export enum SaturationStatus {
  NORMAL = 'NORMAL',
  CHARGE = 'CHARGE',
  SATURE = 'SATURE',
}

export type NroLocation = {
  type: 'Point';
  coordinates: [number, number];
};

@Schema({ timestamps: true, collection: 'nros' })
export class Nro {
  @Prop({ required: true, unique: true, index: true })
  externalId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: false, index: true })
  regionId?: string;

  @Prop({ required: false, index: true })
  centralFiberId?: string;

  @Prop({ type: Types.ObjectId, ref: 'Centrale', required: false, index: true })
  centraleId?: Types.ObjectId;

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
  location!: NroLocation;

  @Prop({ required: true, default: 600 })
  maxCapacity!: number;

  @Prop({ required: true, default: 0 })
  currentLoad!: number;

  @Prop({ required: true, default: 0 })
  capacityGb!: number;

  @Prop({ required: true, default: 0 })
  capaciteUtilisee!: number; // Added for contract tracking

  @Prop({ required: true, default: 0 })
  usedGb!: number;

  @Prop({ required: true, default: 0 })
  performanceScore!: number;

  @Prop({ required: true, enum: Object.values(NroStatus), default: NroStatus.ACTIVE })
  status!: NroStatus;

  @Prop({ required: true, enum: Object.values(SaturationStatus), default: SaturationStatus.NORMAL })
  statutSaturation!: SaturationStatus;

  @Prop({ required: true, default: 0 })
  tauxSaturation!: number; // Percentage 0-100

  @Prop({ required: true, default: 0 })
  connectedFdtsCount!: number;

  @Prop({ required: false })
  deletedAt?: Date;

  @Prop({ required: false })
  lastEventType?: string;

  @Prop({ required: false })
  createdBy?: string;

  @Prop({ required: false })
  createdByRole?: string;

  @Prop({ required: false })
  createdByEmail?: string;

  // Virtual computed field
  get saturationRate(): number {
    if (this.capacityGb === 0) return 0;
    return (this.usedGb / this.capacityGb) * 100;
  }
}

export const NroSchema = SchemaFactory.createForClass(Nro);
NroSchema.index({ location: '2dsphere' });
NroSchema.index({ centraleId: 1 });
