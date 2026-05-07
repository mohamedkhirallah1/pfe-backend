import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class PolygonGeometryDto {
  @IsString()
  @IsNotEmpty()
  type: 'Polygon';

  @IsArray()
  coordinates: number[][][];
}

export class CreateZoneDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  managerUserId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PolygonGeometryDto)
  geometry?: PolygonGeometryDto;
}
