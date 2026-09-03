import { Global, Module } from '@nestjs/common';
import { QlogService } from './qlog.service';
import { QlogContextService } from './qlog-context.service';

@Global()
@Module({
  providers: [QlogService, QlogContextService],
  exports: [QlogService, QlogContextService],
})
export class QlogModule {}
