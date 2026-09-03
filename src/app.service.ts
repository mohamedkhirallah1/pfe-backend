import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { QlogService } from './common/qlog/qlog.service';

@Injectable()
export class AppService implements OnModuleInit {
  constructor(
    @Optional() @InjectConnection() private readonly connection?: Connection,
    @Optional() private readonly qlog?: QlogService,
  ) {}

  onModuleInit(): void {
    if (!this.connection) return;

    this.connection.on('connected', () => {
      this.qlog?.info('MongoDB connection established', 'Mongoose', {
        event: 'database_connected',
      });
    });

    this.connection.on('disconnected', () => {
      this.qlog?.warn('MongoDB connection disconnected', 'Mongoose', {
        event: 'database_disconnected',
      });
    });

    this.connection.on('reconnected', () => {
      this.qlog?.info('MongoDB connection re-established', 'Mongoose', {
        event: 'database_reconnected',
      });
    });

    this.connection.on('error', (err: Error) => {
      this.qlog?.error(`MongoDB connection error: ${err.message}`, err.stack, 'Mongoose', {
        event: 'database_error',
      });
    });

    if (this.connection.readyState === 1) {
      this.qlog?.info('MongoDB already connected', 'Mongoose', {
        event: 'database_connected',
      });
    }
  }

  getHealth(): { status: 'ok'; timestamp: string; uptime: number } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
