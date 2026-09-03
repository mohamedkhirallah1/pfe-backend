import { IsString, IsNotEmpty, IsNumber, IsArray, IsOptional } from 'class-validator';

export class CreateCentraleDto {
  @IsNotEmpty()
  @IsString()
  nom!: string;

  @IsNotEmpty()
  @IsString()
  code!: string;

  @IsNotEmpty()
  @IsString()
  ville!: string;

  @IsNotEmpty()
  @IsString()
  regionId!: string;

  @IsNotEmpty()
  @IsNumber()
  capaciteTotal!: number;

  @IsOptional()
  @IsArray()
  oltIds?: string[];

  @IsNotEmpty()
  @IsArray()
  position!: [number, number]; // [longitude, latitude]
}
