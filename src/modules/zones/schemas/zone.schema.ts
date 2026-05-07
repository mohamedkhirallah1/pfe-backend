import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ZoneDocument = HydratedDocument<Zone>;

@Schema({ timestamps: true, collection: 'zones' })
export class Zone {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: false })
  managerUserId?: string;

  @Prop({ required: false, default: true })
  isActive?: boolean;

  @Prop({
    type: {
      type: String,
      enum: ['Polygon'],
      required: true,
    },
    coordinates: {
      type: [[[Number]]],
      required: true,
    },
  })
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
}

export const ZoneSchema = SchemaFactory.createForClass(Zone);
ZoneSchema.index({ geometry: '2dsphere' });
