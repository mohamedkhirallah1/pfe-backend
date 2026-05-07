import { Injectable } from '@nestjs/common';
import { NewFdtEventDto } from '../../fdt/dto/new-fdt-event.dto';
import { FdtService } from '../../fdt/fdt.service';
import { DomainProcessResult } from '../rabbitmq.types';

@Injectable()
export class FdtConsumer {
  constructor(private readonly fdtService: FdtService) {}

  handleNewFdtEvent(payload: NewFdtEventDto): Promise<DomainProcessResult> {
    return this.fdtService.handleNewFdtEvent(payload);
  }
}
