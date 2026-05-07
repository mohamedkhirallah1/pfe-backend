import { Module } from '@nestjs/common';
import { ContractsModule } from '../contracts/contracts.module';
import { FdtModule } from '../fdt/fdt.module';
import { NroModule } from '../nro/nro.module';
import { ReclamationsModule } from '../reclamations/reclamations.module';
import { ContractConsumer } from './consumers/contract.consumer';
import { FdtConsumer } from './consumers/fdt.consumer';
import { NroConsumer } from './consumers/nro.consumer';
import { ReclamationConsumer } from './consumers/reclamation.consumer';

@Module({
  imports: [ContractsModule, NroModule, FdtModule, ReclamationsModule],
  providers: [ContractConsumer, NroConsumer, FdtConsumer, ReclamationConsumer],
  exports: [ContractConsumer, NroConsumer, FdtConsumer, ReclamationConsumer],
})
export class EventConsumerModule {}
