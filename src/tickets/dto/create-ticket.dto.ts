import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateTicketDto {
  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsUUID()
  sourceReclamationId?: string;

  @IsOptional()
  @IsUUID()
  polygonId?: string;
}