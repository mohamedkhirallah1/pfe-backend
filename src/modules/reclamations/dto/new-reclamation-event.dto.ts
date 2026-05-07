import { IsNumber, IsOptional, IsString } from 'class-validator';

export class NewReclamationEventDto {
  @IsString()
  externalId: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  cin?: string;

  @IsString()
  type: string;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;
}
