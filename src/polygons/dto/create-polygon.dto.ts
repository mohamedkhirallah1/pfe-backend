import { IsObject, IsString, IsUUID } from 'class-validator';

export class CreatePolygonDto {
  @IsString()
  name: string;

  @IsUUID()
  zoneId: string;

  @IsObject()
  boundary: object;
}