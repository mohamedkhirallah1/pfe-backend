import { IsString, IsOptional, IsNumber, IsArray } from 'class-validator';

export class UpdateCentraleDto {
	@IsOptional()
	@IsString()
	nom?: string;

	@IsOptional()
	@IsString()
	code?: string;

	@IsOptional()
	@IsString()
	ville?: string;

	@IsOptional()
	@IsString()
	regionId?: string;

	@IsOptional()
	@IsNumber()
	capaciteTotal?: number;

	@IsOptional()
	@IsArray()
	oltIds?: string[];

	@IsOptional()
	@IsArray()
	position?: [number, number];
}
