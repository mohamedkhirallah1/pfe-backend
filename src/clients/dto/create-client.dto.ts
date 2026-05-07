import { IsNumber, IsString } from 'class-validator';

export class CreateClientDto {
  @IsString()
  contractId: string;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;
}