import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { FdtStatus } from '../schemas/fdt.schema';

export class CreateFdtDto {
  @IsString()
  @IsNotEmpty()
  externalId!: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsNotEmpty()
  nroId!: string;

  @IsString()
  @IsOptional()
  centraleId?: string;

  @IsString()
  @IsOptional()
  regionId?: string;

  @IsNumber()
  latitude!: number;

  @IsNumber()
  longitude!: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  nbPortsTotal?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  maxClients?: number;

  @IsEnum(FdtStatus)
  @IsOptional()
  status?: FdtStatus;
}
