import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiModule } from '../ai/ai.module';
import { ContractsModule } from '../contracts/contracts.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { NroModule } from '../nro/nro.module';
import { ZonesModule } from '../zones/zones.module';
import { Reclamation, ReclamationSchema } from './schemas/reclamation.schema';
import { ReclamationsService } from './reclamations.service';
import { ReclamationsController } from './controllers/reclamations.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Reclamation.name, schema: ReclamationSchema }]),
    ZonesModule,
    AiModule,
    NotificationsModule,
    NroModule,
    ContractsModule,
  ],
  providers: [ReclamationsService],
  controllers: [ReclamationsController],
  exports: [ReclamationsService, MongooseModule],
})
export class ReclamationsModule {}
