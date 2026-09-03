import { IsNumber, IsOptional, IsString } from 'class-validator';

export class NewFdtEventDto {
  @IsString()
  externalId!: string;

  @IsOptional()
  @IsString()
  nroId?: string;

  @IsOptional()
  @IsString()
  regionId?: string;

  @IsNumber()
  latitude!: number;

  @IsNumber()
  longitude!: number;
}