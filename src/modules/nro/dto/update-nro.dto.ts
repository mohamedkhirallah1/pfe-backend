import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { NroStatus } from '../schemas/nro.schema';

export class UpdateNroDto {
  @IsString()
  @IsOptional()
  name?: string;

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
  maxCapacity?: number;

  @IsEnum(NroStatus)
  @IsOptional()
  status?: NroStatus;
}
