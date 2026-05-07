import { IsNumber, IsOptional, IsString } from 'class-validator';

export class NewContractEventDto {
  @IsString()
  externalId: string;

  @IsOptional()
  @IsString()
  nroId?: string;

  @IsOptional()
  @IsString()
  regionId?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  cin?: string;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  @IsNumber()
  bandwidth: number;
}
