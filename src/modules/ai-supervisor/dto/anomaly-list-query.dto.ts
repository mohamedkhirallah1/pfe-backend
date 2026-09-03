import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsPositive, IsString, IsDateString, Max } from 'class-validator';
import { AnomalyEntityType, AnomalySeverity, AnomalyStatus, AnomalyType } from '../types/anomaly.types';

export class AnomalyListQueryDto {
  @IsOptional()
  @IsString()
  zoneId?: string;

  @IsOptional()
  @IsEnum(AnomalyEntityType)
  entityType?: AnomalyEntityType;

  @IsOptional()
  @IsEnum(AnomalySeverity)
  severity?: AnomalySeverity;

  @IsOptional()
  @IsEnum(AnomalyType)
  anomalyType?: AnomalyType;

  @IsOptional()
  @IsEnum(AnomalyStatus)
  status?: AnomalyStatus;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(1000)
  page?: number;
}
