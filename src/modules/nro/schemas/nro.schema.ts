import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type NroDocument = HydratedDocument<Nro>;

export enum NroStatus {
  ACTIVE = 'ACTIVE',
  SATURATED = 'SATURATED',
  DOWN = 'DOWN',
  DELETED = 'DELETED',
}

export type NroLocation = {
  type: 'Point';
  coordinates: [number, number];
};

@Schema({ timestamps: true, collection: 'nros' })
export class Nro {
  @Prop({ required: true, unique: true, index: true })
  externalId: string;

  @Prop({ required: true })
  name: string;

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
  location: NroLocation;

  @Prop({ required: true, default: 600 })
  maxCapacity: number;

  @Prop({ required: true, default: 0 })
  currentLoad: number;

  @Prop({ required: true, enum: Object.values(NroStatus), default: NroStatus.ACTIVE })
  status: NroStatus;

  @Prop({ required: false })
  deletedAt?: Date;

  @Prop({ required: false })
  lastEventType?: string;
}

export const NroSchema = SchemaFactory.createForClass(Nro);
NroSchema.index({ location: '2dsphere' });
