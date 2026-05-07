import { Injectable } from '@nestjs/common';
import { DeleteNroEventDto } from '../../nro/dto/delete-nro-event.dto';
import { NewNroEventDto } from '../../nro/dto/new-nro-event.dto';
import { UpdateNroEventDto } from '../../nro/dto/update-nro-event.dto';
import { NroService } from '../../nro/nro.service';
import { DomainProcessResult } from '../rabbitmq.types';

@Injectable()
export class NroConsumer {
  constructor(private readonly nroService: NroService) {}

  handleNewNroEvent(payload: NewNroEventDto): Promise<DomainProcessResult> {
    return this.nroService.handleNewNroEvent(payload);
  }

  handleUpdateNroEvent(payload: UpdateNroEventDto): Promise<DomainProcessResult> {
    return this.nroService.handleUpdateNroEvent(payload);
  }

  handleDeleteNroEvent(payload: DeleteNroEventDto): Promise<DomainProcessResult> {
    return this.nroService.handleDeleteNroEvent(payload);
  }
}
