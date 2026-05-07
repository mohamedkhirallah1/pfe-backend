import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type FdtDocument = HydratedDocument<Fdt>;

export type FdtLocation = {
  type: 'Point';
  coordinates: [number, number];
};

@Schema({ timestamps: true, collection: 'fdts' })
export class Fdt {
  @Prop({ required: true, unique: true, index: true })
  externalId: string;

  @Prop({ required: false, index: true })
  nroId?: string;

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
  location: FdtLocation;
}

export const FdtSchema = SchemaFactory.createForClass(Fdt);
FdtSchema.index({ location: '2dsphere' });
