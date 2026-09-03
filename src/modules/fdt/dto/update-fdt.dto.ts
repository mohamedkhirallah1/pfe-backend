import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { FdtStatus } from '../schemas/fdt.schema';

export class UpdateFdtDto {
  @IsString()
  @IsOptional()
  nroId?: string;

  @IsString()
  @IsOptional()
  regionId?: string;

  @IsNumber()
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;

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
