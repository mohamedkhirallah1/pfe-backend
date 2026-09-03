import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Recommendation } from '../interfaces/analysis.types';
import { AiRecommendation, RecommendationDocument, RecommendationStatus } from './schemas/recommendation.schema';

const PRIORITY_WEIGHT: Record<string, number> = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

/**
 * This IS the recommendation engine: agents produce raw Recommendation[] suggestions, this
 * service is where they get deduplicated, ranked, and persisted as the durable, queryable
 * record admins act on. A near-duplicate (same action+affectedArea) generated again within the
 * dedupe window is skipped rather than spamming the same suggestion every cron tick.
 */
@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);
  private readonly dedupeWindowHours = 12;

  constructor(
    @InjectModel(AiRecommendation.name)
    private readonly recommendationModel: Model<RecommendationDocument>,
  ) {}

  async ingest(recommendations: Array<Recommendation & { sourceAgent?: string }>): Promise<RecommendationDocument[]> {
    const persisted: RecommendationDocument[] = [];
    const since = new Date(Date.now() - this.dedupeWindowHours * 60 * 60 * 1000);

    for (const rec of recommendations) {
      const duplicate = await this.recommendationModel
        .findOne({
          action: rec.action,
          affectedArea: rec.affectedArea,
          status: RecommendationStatus.PENDING,
          createdAt: { $gte: since },
        })
        .exec();

      if (duplicate) {
        continue;
      }

      const doc = await this.recommendationModel.create({ ...rec, status: RecommendationStatus.PENDING });
      persisted.push(doc);
    }

    if (persisted.length > 0) {
      this.logger.log(`Persisted ${persisted.length} new recommendation(s) (${recommendations.length - persisted.length} deduplicated)`);
    }

    return this.rankByPriority(persisted);
  }

  private rankByPriority(recommendations: RecommendationDocument[]): RecommendationDocument[] {
    return [...recommendations].sort((a, b) => {
      const priorityDiff = (PRIORITY_WEIGHT[b.priority] ?? 0) - (PRIORITY_WEIGHT[a.priority] ?? 0);
      if (priorityDiff !== 0) return priorityDiff;
      return b.confidence - a.confidence;
    });
  }

  findAll(limit = 100, zoneId?: string): Promise<RecommendationDocument[]> {
    const filter = zoneId ? { zoneId } : {};
    return this.recommendationModel.find(filter).sort({ createdAt: -1 }).limit(limit).exec();
  }

  findPending(limit = 100, zoneId?: string): Promise<RecommendationDocument[]> {
    const filter: Record<string, unknown> = { status: RecommendationStatus.PENDING };
    if (zoneId) filter.zoneId = zoneId;
    return this.recommendationModel.find(filter).sort({ createdAt: -1 }).limit(limit).exec();
  }

  /**
   * Closes the observe -> decide -> wait-for-validation -> re-evaluate loop: an admin decision
   * is recorded here (status + timestamp + optional note), which IS the AI's memory of what
   * was accepted or rejected — future runs can be extended to read this history back in.
   */
  async setStatus(id: string, status: RecommendationStatus, reviewNote?: string): Promise<RecommendationDocument | null> {
    return this.recommendationModel
      .findByIdAndUpdate(id, { status, reviewedAt: new Date(), reviewNote }, { new: true })
      .exec();
  }

  findByStatus(status: RecommendationStatus, limit = 100): Promise<RecommendationDocument[]> {
    return this.recommendationModel.find({ status }).sort({ reviewedAt: -1, createdAt: -1 }).limit(limit).exec();
  }

  /** Infrastructure proposals (new NRO/FDT candidates) are recommendations with `infrastructureType`
   *  set — reuses the same collection/pipeline instead of a parallel one, per Part 12's preference. */
  findInfrastructureProposals(limit = 100, zoneId?: string): Promise<RecommendationDocument[]> {
    const filter: Record<string, unknown> = { infrastructureType: { $exists: true } };
    if (zoneId) filter.zoneId = zoneId;
    return this.recommendationModel.find(filter).sort({ createdAt: -1 }).limit(limit).exec();
  }

  async topRanked(limit = 10, zoneId?: string): Promise<RecommendationDocument[]> {
    const pending = await this.findPending(200, zoneId);
    return this.rankByPriority(pending).slice(0, limit);
  }
}
