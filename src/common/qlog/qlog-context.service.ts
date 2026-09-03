import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { QlogRequestContext } from './qlog.types';

@Injectable()
export class QlogContextService {
  private readonly asyncLocalStorage = new AsyncLocalStorage<QlogRequestContext>();

  runWithContext<T>(context: QlogRequestContext, fn: () => T): T {
    return this.asyncLocalStorage.run(context, fn);
  }

  getContext(): QlogRequestContext | undefined {
    return this.asyncLocalStorage.getStore();
  }

  getRequestId(): string | undefined {
    return this.asyncLocalStorage.getStore()?.requestId;
  }

  getCorrelationId(): string | undefined {
    return this.asyncLocalStorage.getStore()?.correlationId;
  }

  getUserContext(): { userId?: string; role?: string; zoneId?: string } {
    const store = this.asyncLocalStorage.getStore();
    return {
      userId: store?.userId,
      role: store?.role,
      zoneId: store?.zoneId,
    };
  }

  setUser(userId?: string, role?: string, zoneId?: string): void {
    const store = this.asyncLocalStorage.getStore();
    if (store) {
      if (userId) store.userId = userId;
      if (role) store.role = role;
      if (zoneId) store.zoneId = zoneId;
    }
  }
}
