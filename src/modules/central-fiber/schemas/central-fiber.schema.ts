import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CentralFiberDocument = HydratedDocument<CentralFiber>;

export enum CentralFiberStatus {
  ACTIVE = 'ACTIVE',
  DOWN = 'DOWN',
  MAINTENANCE = 'MAINTENANCE',
}

export type CentralFiberLocation = {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
};

@Schema({ timestamps: true, collection: 'central_fibers' })
export class CentralFiber {
  @Prop({ required: true, unique: true, index: true })
  externalId: string;

  @Prop({ required: true, index: true })
  name: string;

  @Prop({ required: true, index: true })
  city: string;

  @Prop({ required: true, index: true })
  zoneId: string;

  @Prop({ required: true, enum: Object.values(CentralFiberStatus), default: CentralFiberStatus.ACTIVE })
  status: CentralFiberStatus;

  @Prop({ required: true, default: 0 })
  totalCapacityGb: number;

  @Prop({ required: true, default: 0 })
  usedCapacityGb: number;

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
  location: CentralFiberLocation;

  @Prop({ required: true, default: Date.now })
  createdAt: Date;

  @Prop({ required: true, default: Date.now })
  updatedAt: Date;

  // Virtual computed field (not stored)
  get saturationRate(): number {
    if (this.totalCapacityGb === 0) return 0;
    return (this.usedCapacityGb / this.totalCapacityGb) * 100;
  }

  get availableCapacityGb(): number {
    return this.totalCapacityGb - this.usedCapacityGb;
  }
}

export const CentralFiberSchema = SchemaFactory.createForClass(CentralFiber);
CentralFiberSchema.index({ location: '2dsphere' });
CentralFiberSchema.index({ zoneId: 1 });
CentralFiberSchema.index({ city: 1 });
CentralFiberSchema.index({ status: 1 });
