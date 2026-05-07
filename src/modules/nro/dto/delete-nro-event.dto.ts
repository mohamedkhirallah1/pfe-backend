import { IsString } from 'class-validator';

export class DeleteNroEventDto {
  @IsString()
  nroId: string;
}