import { forwardRef, Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { HttpMetricsInterceptor } from '../interceptors/http-metrics.interceptor';
import { UsersModule } from '../../modules/users/users.module';
import { CryptoModule } from '../crypto/crypto.module';

@Global()
@Module({
  imports: [forwardRef(() => UsersModule), forwardRef(() => CryptoModule)],
  controllers: [MetricsController],
  providers: [
    MetricsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
  exports: [MetricsService],
})
export class MetricsModule {}
