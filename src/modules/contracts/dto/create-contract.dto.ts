import { IsArray, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { ClientType } from '../schemas/contract.schema';

export class CreateContractDto {
  @IsOptional()
  @IsString()
  externalId?: string;

  @IsString()
  @IsNotEmpty()
  numeroTelephone!: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsString()
  @IsNotEmpty()
  numeroCIN!: string;

  @IsOptional()
  @IsString()
  cin?: string;

  @IsNumber()
  latitude!: number;

  @IsNumber()
  longitude!: number;

  @IsOptional()
  @IsNumber()
  offreGB?: number;

  @IsOptional()
  @IsNumber()
  bandwidth?: number;

  @IsOptional()
  @IsEnum(ClientType)
  typeClient?: ClientType;

  @IsOptional()
  @IsString()
  regionId?: string;

  @IsOptional()
  @IsString()
  zoneId?: string;

  @IsOptional()
  @IsString()
  centraleId?: string;

  @IsOptional()
  @IsString()
  nroId?: string;

  @IsString()
  @IsNotEmpty()
  fdtId!: string;

  @IsOptional()
  @IsArray()
  traceFDT?: [number, number][];
}
