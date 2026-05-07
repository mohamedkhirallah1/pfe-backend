import { IsString } from 'class-validator';

export class CancelContractEventDto {
  @IsString()
  externalId: string;
}
