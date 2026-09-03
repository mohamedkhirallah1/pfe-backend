import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CentraleDocument = HydratedDocument<Centrale>;

export type CentraleLocation = {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
};

@Schema({ timestamps: true, collection: 'centrales' })
export class Centrale {
  @Prop({ required: true, index: true })
  nom!: string;

  @Prop({ required: true, unique: true, index: true })
  code!: string; // ex: "CO-TUN-01"

  @Prop({ required: true, index: true })
  ville!: string;

  @Prop({ type: Types.ObjectId, ref: 'Zone', required: true, index: true })
  regionId!: Types.ObjectId;

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
      index: '2dsphere',
    },
  })
  position!: CentraleLocation;

  @Prop({ required: true })
  capaciteTotal!: number; // GB totaux

  @Prop({ type: [String], default: [] })
  oltIds?: string[];

  @Prop({ required: false })
  createdBy?: string;

  @Prop({ required: false })
  createdByRole?: string;

  @Prop({ required: false })
  createdByEmail?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CentraleSchema = SchemaFactory.createForClass(Centrale);
CentraleSchema.index({ position: '2dsphere' });
CentraleSchema.index({ code: 1 }, { unique: true });
