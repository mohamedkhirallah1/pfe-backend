import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { AppRole } from '../../auth/roles.enum';

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true, unique: true, trim: true })
  username: string;

  @Prop({ required: true })
  password: string;

  @Prop({
    type: String,
    required: false,
    lowercase: true,
    trim: true,
    sparse: true,
    unique: true,
  })
  email?: string;

  @Prop({ required: true, enum: Object.values(AppRole) })
  role: AppRole;

  @Prop({ type: String, required: false })
  zoneId?: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({
    type: String,
    enum: ['fr', 'en', 'ar'],
    default: 'fr',
  })
  language?: string;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
