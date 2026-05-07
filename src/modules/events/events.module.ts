import { Module } from '@nestjs/common';
import { MapModule } from '../map/map.module';
import { RabbitMqModule } from '../rabbitmq/rabbitmq.module';
import { DebugController } from './debug.controller';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [RabbitMqModule, MapModule],
  controllers: [EventsController, DebugController],
  providers: [EventsService],
})
export class EventsModule {}
