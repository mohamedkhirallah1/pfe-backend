import { IsNumber, IsOptional, IsString, IsArray, IsEnum } from 'class-validator';
import { ClientType } from '../schemas/contract.schema';

export class NewContractEventDto {
  @IsString()
  externalId!: string;

  @IsOptional()
  @IsString()
  nroId?: string;

  @IsOptional()
  @IsString()
  regionId?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  cin?: string;

  @IsString()
  numeroTelephone!: string; // 8 chiffres

  @IsString()
  numeroCIN!: string; // 8 chiffres

  @IsNumber()
  latitude!: number;

  @IsNumber()
  longitude!: number;

  @IsNumber()
  bandwidth!: number;

  @IsNumber()
  offreGB!: number; // Bande passante souscrite

  @IsEnum(ClientType)
  typeClient!: ClientType;

  @IsOptional()
  @IsArray()
  traceFDT?: [number, number][]; // LineString coordinates
}

