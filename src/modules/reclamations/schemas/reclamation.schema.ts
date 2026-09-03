import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ReclamationDocument = HydratedDocument<Reclamation>;

export enum TypeReclamation {
  FAIBLE_DEBIT = 'FAIBLE_DEBIT',
  COUPURE = 'COUPURE',
  REINITIALISATION = 'REINITIALISATION',
}

export enum ActionType {
  TECHNICIEN = 'TECHNICIEN',
  REDEMARRAGE = 'REDEMARRAGE',
  NOUVEAU_FDT = 'NOUVEAU_FDT',
  NOUVEAU_NRO = 'NOUVEAU_NRO',
}

export type PositionSuggeree = {
  type: 'Point';
  coordinates: [number, number];
};

@Schema({ timestamps: true, collection: 'reclamations' })
export class Reclamation {
  @Prop({ required: true, unique: true })
  externalId!: string;

  @Prop({ required: false, index: true })
  phoneNumber?: string;

  @Prop({ required: true, index: true })
  numeroCIN!: string;

  @Prop({ required: false, index: true })
  cin?: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ required: true, enum: Object.values(TypeReclamation) })
  typeReclamation!: TypeReclamation;

  @Prop({ required: true, default: 'NEW' })
  status!: string;

  @Prop({ required: true })
  latitude!: number;

  @Prop({ required: true })
  longitude!: number;

  @Prop({ required: false })
  zoneId?: string;

  /** The linked NRO's externalId — same convention as Contract.nroId/Fdt.nroId, NOT the Mongo _id. */
  @Prop({ required: false, index: true })
  nroId?: string;

  /** The linked FDT's externalId — same convention as Contract.fdtId. Lets a complaint reach
   *  Contract -> FDT -> NRO -> Centrale -> Zone, per the FTTH hierarchy. */
  @Prop({ required: false, index: true })
  fdtId?: string;

  /** The linked Centrale's ObjectId — mirrors Contract.centraleId. */
  @Prop({ type: Types.ObjectId, ref: 'Centrale', required: false, index: true })
  centraleId?: Types.ObjectId;

  @Prop({ required: false, index: true })
  contractId?: string;

  @Prop({ required: false, index: true })
  regionId?: string;

  @Prop({ required: true })
  category!: string;

  @Prop({ required: true })
  priority!: string;

  @Prop({ required: true })
  recommendation!: string;

  @Prop({ required: false, enum: Object.values(ActionType) })
  actionType?: ActionType;

  @Prop({
    type: {
      type: String,
      enum: ['Point'],
    },
    coordinates: {
      type: [Number],
    },
  })
  positionSuggeree?: PositionSuggeree;

  @Prop({ required: true, default: false })
  urgence!: boolean;

  @Prop({ required: false })
  createdBy?: string;

  @Prop({ required: false })
  createdByRole?: string;

  @Prop({ required: false })
  createdByEmail?: string;

  @Prop({ required: true, default: Date.now })
  createdAt!: Date;
}

export const ReclamationSchema = SchemaFactory.createForClass(Reclamation);
ReclamationSchema.index({ numeroCIN: 1 });
ReclamationSchema.index({ typeReclamation: 1 });
