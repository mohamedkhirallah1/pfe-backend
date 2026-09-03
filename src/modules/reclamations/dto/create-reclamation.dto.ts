import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { TypeReclamation } from '../schemas/reclamation.schema';

export class CreateReclamationDto {
  @IsOptional()
  @IsString()
  externalId?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  numeroTelephone?: string;

  @IsOptional()
  @IsString()
  cin?: string;

  @IsOptional()
  @IsString()
  numeroCIN?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsEnum(TypeReclamation)
  typeReclamation?: TypeReclamation;

  @IsNumber()
  latitude!: number;

  @IsNumber()
  longitude!: number;

  @IsOptional()
  @IsString()
  zoneId?: string;

  @IsOptional()
  @IsString()
  regionId?: string;

  @IsOptional()
  @IsString()
  nroId?: string;

  @IsOptional()
  @IsString()
  fdtId?: string;
}
