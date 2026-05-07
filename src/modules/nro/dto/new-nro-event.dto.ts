import { IsNumber, IsOptional, IsString } from 'class-validator';

export class NewNroEventDto {
  @IsString()
  nroId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  regionId?: string;

  @IsOptional()
  @IsString()
  regionName?: string;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  @IsNumber()
  maxCapacity: number;
}