import { Injectable } from '@nestjs/common';
import { CancelContractEventDto } from '../../contracts/dto/cancel-contract-event.dto';
import { NewContractEventDto } from '../../contracts/dto/new-contract-event.dto';
import { ContractsService } from '../../contracts/contracts.service';
import { DomainProcessResult } from '../rabbitmq.types';

@Injectable()
export class ContractConsumer {
  constructor(private readonly contractsService: ContractsService) {}

  handleNewContractEvent(payload: NewContractEventDto): Promise<DomainProcessResult> {
    return this.contractsService.handleNewContractEvent(payload);
  }

  handleCancelContractEvent(payload: CancelContractEventDto): Promise<DomainProcessResult> {
    return this.contractsService.handleCancelContractEvent(payload);
  }
}
