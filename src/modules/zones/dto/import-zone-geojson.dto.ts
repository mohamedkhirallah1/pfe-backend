import { IsOptional } from 'class-validator';

export class ImportZoneGeojsonDto {
  @IsOptional()
  type?: string;

  @IsOptional()
  features?: any[];

  @IsOptional()
  geometry?: any;

  @IsOptional()
  properties?: any;

  @IsOptional()
  geojson?: any;
}
