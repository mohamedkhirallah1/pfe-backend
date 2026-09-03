import { Module } from '@nestjs/common';
import { MapModule } from '../map/map.module';
import { RabbitMqModule } from '../rabbitmq/rabbitmq.module';
import { InternalApiKeyGuard } from '../../common/guards/internal-api-key.guard';
import { DebugController } from './debug.controller';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

// DebugController injects arbitrary test events and reflects request headers back to the
// caller. It must never be routable in production, not merely guarded — so it's excluded from
// the controllers array entirely instead of relying on a runtime check inside each handler.
const isProduction = process.env.NODE_ENV === 'production';

@Module({
  imports: [RabbitMqModule, MapModule],
  controllers: [EventsController, ...(isProduction ? [] : [DebugController])],
  providers: [EventsService, InternalApiKeyGuard],
})
export class EventsModule {}
