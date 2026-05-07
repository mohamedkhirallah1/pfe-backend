import { IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class PolygonGeometryDto {
	@IsOptional()
	@IsString()
	type?: 'Polygon';

	@IsOptional()
	coordinates?: number[][][];
}

export class UpdateZoneDto {
	@IsOptional()
	@IsString()
	name?: string;

	@IsOptional()
	@IsString()
	managerUserId?: string;

	@IsOptional()
	@ValidateNested()
	@Type(() => PolygonGeometryDto)
	geometry?: PolygonGeometryDto;

	@IsOptional()
	@IsBoolean()
	isActive?: boolean;
}
