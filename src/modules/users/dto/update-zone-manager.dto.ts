import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { TUNISIA_REGIONS } from '../constants/tunisia-regions.constant';
import { normalizeTunisiaRegionName } from '../../zones/constants/tunisia-region-centers.constant';

export class UpdateZoneManagerDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  username?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Invalid email format' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? (normalizeTunisiaRegionName(value) ?? value) : value,
  )
  @IsIn(TUNISIA_REGIONS)
  zoneId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
