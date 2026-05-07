import { Injectable } from '@nestjs/common';
import { NewReclamationEventDto } from '../../reclamations/dto/new-reclamation-event.dto';
import { ReclamationsService } from '../../reclamations/reclamations.service';
import { DomainProcessResult } from '../rabbitmq.types';

@Injectable()
export class ReclamationConsumer {
  constructor(private readonly reclamationsService: ReclamationsService) {}

  handleNewReclamationEvent(payload: NewReclamationEventDto): Promise<DomainProcessResult> {
    return this.reclamationsService.handleNewReclamationEvent(payload);
  }
}
