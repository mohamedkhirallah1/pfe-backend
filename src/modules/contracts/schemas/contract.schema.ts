import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ContractDocument = HydratedDocument<Contract>;

export enum ContractStatus {
  ACTIVE = 'ACTIVE',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
}

export enum ClientType {
  MAISON = 'MAISON',
  ENTREPRISE = 'ENTREPRISE',
  IMMEUBLE = 'IMMEUBLE',
}

export enum InstallationStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export type TraceFdtGeometry = {
  type: 'LineString';
  coordinates: [number, number][];
};

@Schema({ timestamps: true, collection: 'contracts' })
export class Contract {
  @Prop({ required: true, unique: true })
  externalId!: string;

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
  location!: {
    type: 'Point';
    coordinates: [number, number];
  };

  @Prop({ required: true, unique: true, index: true })
  numeroTelephone!: string; // 8 chiffres

  @Prop({ required: true, index: true })
  numeroCIN!: string; // 8 chiffres

  @Prop({ required: false, index: true })
  phoneNumber?: string;

  @Prop({ required: false, index: true })
  cin?: string;

  @Prop({ required: true, enum: ContractStatus })
  status!: ContractStatus;

  @Prop({ required: true })
  latitude!: number;

  @Prop({ required: true })
  longitude!: number;

  @Prop({ required: true, default: 0 })
  bandwidth!: number;

  @Prop({ required: true })
  offreGB!: number; // Bande passante souscrite

  @Prop({ required: false })
  zoneId?: string;

  @Prop({ required: false, index: true })
  nroId?: string;

  @Prop({ required: false, index: true })
  fdtId?: string;

  @Prop({ required: false, index: true })
  centralFiberId?: string;

  @Prop({ type: Types.ObjectId, ref: 'Centrale', required: false, index: true })
  centraleId?: Types.ObjectId;

  @Prop({ required: false })
  rejectReason?: string;

  @Prop({ required: false, index: true })
  regionId?: string;

  @Prop({ required: true, default: 0 })
  packageGb!: number;

  @Prop({ required: true, enum: Object.values(ClientType), default: ClientType.MAISON })
  typeClient!: ClientType;

  @Prop({ required: true, enum: Object.values(InstallationStatus), default: InstallationStatus.PENDING })
  installationStatus!: InstallationStatus;

  @Prop({
    type: {
      type: String,
      enum: ['LineString'],
      default: 'LineString',
    },
    coordinates: {
      type: [[Number]],
      default: [],
    },
  })
  traceFDT?: TraceFdtGeometry;

  @Prop({ required: false })
  createdBy?: string;

  @Prop({ required: false })
  createdByRole?: string;

  @Prop({ required: false })
  createdByEmail?: string;

  @Prop({ required: true, default: Date.now })
  createdAt!: Date;
}

export const ContractSchema = SchemaFactory.createForClass(Contract);
ContractSchema.index({ location: '2dsphere' });
ContractSchema.index({ centraleId: 1 });
ContractSchema.index({ numeroTelephone: 1 }, { unique: true });
