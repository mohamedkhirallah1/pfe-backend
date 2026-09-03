import { IsString, IsNotEmpty, IsNumber, IsEnum, Min, IsOptional } from 'class-validator';
import { CentralFiberStatus } from '../schemas/central-fiber.schema';

export class CreateCentralFiberDto {
  @IsString()
  @IsNotEmpty()
  externalId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsString()
  @IsNotEmpty()
  zoneId!: string;

  @IsNumber()
  @Min(0)
  totalCapacityGb!: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  usedCapacityGb?: number;

  @IsNumber()
  latitude!: number;

  @IsNumber()
  longitude!: number;

  @IsEnum(CentralFiberStatus)
  @IsOptional()
  status?: CentralFiberStatus;
}

export class UpdateCentralFiberDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  totalCapacityGb?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  usedCapacityGb?: number;

  @IsEnum(CentralFiberStatus)
  @IsOptional()
  status?: CentralFiberStatus;

  @IsNumber()
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;
}
