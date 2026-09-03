import { IsString, MinLength, IsNotEmpty, IsEmail, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';
import { TUNISIA_REGIONS } from '../constants/tunisia-regions.constant';
import { normalizeTunisiaRegionName } from '../../zones/constants/tunisia-region-centers.constant';

export class CreateZoneManagerDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  username!: string;

  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required for zone managers' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password!: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) =>
    typeof value === 'string' ? (normalizeTunisiaRegionName(value) ?? value) : value,
  )
  @IsIn(TUNISIA_REGIONS)
  zoneId!: string;
}
