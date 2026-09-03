import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NetworkSnapshot, NetworkSnapshotDocument } from '../reports/schemas/network-snapshot.schema';
import { TimeSeriesPoint } from '../strategies/trend.strategy';

@Injectable()
export class SnapshotService {
  constructor(
    @InjectModel(NetworkSnapshot.name)
    private readonly snapshotModel: Model<NetworkSnapshotDocument>,
  ) {}

  record(metric: string, value: number, scope: { zoneId?: string; nroExternalId?: string; fdtExternalId?: string } = {}): Promise<unknown> {
    return this.snapshotModel.create({ metric, value, ...scope });
  }

  async history(
    metric: string,
    scope: { zoneId?: string; nroExternalId?: string; fdtExternalId?: string } = {},
    lookbackDays = 30,
  ): Promise<TimeSeriesPoint[]> {
    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
    const docs = await this.snapshotModel
      .find({ metric, ...scope, createdAt: { $gte: since } })
      .sort({ createdAt: 1 })
      .exec();

    return docs.map((doc) => ({
      timestampMs: (doc as unknown as { createdAt: Date }).createdAt.getTime(),
      value: doc.value,
    }));
  }
}
