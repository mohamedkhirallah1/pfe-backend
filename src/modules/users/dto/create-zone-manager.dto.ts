import { IsString, MinLength, IsNotEmpty } from 'class-validator';
import { IsIn } from 'class-validator';
import { Transform } from 'class-transformer';
import { TUNISIA_REGIONS } from '../constants/tunisia-regions.constant';
import { normalizeTunisiaRegionName } from '../../zones/constants/tunisia-region-centers.constant';

export class CreateZoneManagerDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  username: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) =>
    typeof value === 'string' ? (normalizeTunisiaRegionName(value) ?? value) : value,
  )
  @IsIn(TUNISIA_REGIONS)
  zoneId: string;
}

