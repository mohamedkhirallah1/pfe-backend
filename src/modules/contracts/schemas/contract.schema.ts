import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ContractDocument = HydratedDocument<Contract>;

export enum ContractStatus {
  ACTIVE = 'ACTIVE',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
}

@Schema({ timestamps: true, collection: 'contracts' })
export class Contract {
  @Prop({ required: true, unique: true })
  externalId: string;

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
  location: {
    type: 'Point';
    coordinates: [number, number];
  };

  @Prop({ required: false, index: true })
  phoneNumber?: string;

  @Prop({ required: false, index: true })
  cin?: string;

  @Prop({ required: true, enum: ContractStatus })
  status: ContractStatus;

  @Prop({ required: true })
  latitude: number;

  @Prop({ required: true })
  longitude: number;

  @Prop({ required: true, default: 0 })
  bandwidth: number;

  @Prop({ required: false })
  zoneId?: string;

  @Prop({ required: false, index: true })
  nroId?: string;

  @Prop({ required: false, index: true })
  fdtId?: string;

  @Prop({ required: false })
  rejectReason?: string;

  @Prop({ required: false, index: true })
  regionId?: string;

  @Prop({ required: true, default: Date.now })
  createdAt: Date;
}

export const ContractSchema = SchemaFactory.createForClass(Contract);
ContractSchema.index({ location: '2dsphere' });
