import { IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateNroEventDto {
  @IsString()
  nroId: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  regionId?: string;

  @IsOptional()
  @IsString()
  regionName?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsNumber()
  maxCapacity?: number;
}