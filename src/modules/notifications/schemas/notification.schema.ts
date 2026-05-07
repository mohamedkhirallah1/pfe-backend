import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type NotificationDocument = HydratedDocument<Notification>;

@Schema({ timestamps: true, collection: 'notifications' })
export class Notification {
  @Prop({ required: true })
  type: string;

  @Prop({ required: false })
  eventType?: string;

  @Prop({ required: false })
  entityType?: string;

  @Prop({ required: false })
  externalId?: string;

  @Prop({ required: false })
  status?: string;

  @Prop({ required: false })
  latitude?: number;

  @Prop({ required: false })
  longitude?: number;

  @Prop({ required: true })
  message: string;

  @Prop({ required: true })
  target: string;

  @Prop({ required: false })
  zoneId?: string;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
