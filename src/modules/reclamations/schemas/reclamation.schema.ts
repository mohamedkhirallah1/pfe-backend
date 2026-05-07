import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ReclamationDocument = HydratedDocument<Reclamation>;

@Schema({ timestamps: true, collection: 'reclamations' })
export class Reclamation {
  @Prop({ required: true, unique: true })
  externalId: string;

  @Prop({ required: false, index: true })
  phoneNumber?: string;

  @Prop({ required: false, index: true })
  cin?: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  type: string;

  @Prop({ required: true, default: 'NEW' })
  status: string;

  @Prop({ required: true })
  latitude: number;

  @Prop({ required: true })
  longitude: number;

  @Prop({ required: false })
  zoneId?: string;

  @Prop({ required: false, index: true })
  nroId?: string;

  @Prop({ required: false, index: true })
  contractId?: string;

  @Prop({ required: false, index: true })
  regionId?: string;

  @Prop({ required: true })
  category: string;

  @Prop({ required: true })
  priority: string;

  @Prop({ required: true })
  recommendation: string;

  @Prop({ required: true, default: Date.now })
  createdAt: Date;
}

export const ReclamationSchema = SchemaFactory.createForClass(Reclamation);
