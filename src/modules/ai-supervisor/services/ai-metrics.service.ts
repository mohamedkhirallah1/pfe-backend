import { Injectable, Optional } from '@nestjs/common';
import { MetricsService } from '../../../common/metrics/metrics.service';

export type AiMetricsSnapshot = {
  groqRequestsTotal: number;
  groqSuccessTotal: number;
  groq429Total: number;
  groqErrorTotal: number;
  groqFallbackTotal: number;
  cacheHitsTotal: number;
  cacheMissesTotal: number;
  circuitBreakerOpenTotal: number;
  circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  groqLatencyMsAvg: number;
  anomalyDetectionRunsTotal: number;
  anomaliesDetectedTotal: number;
  anomaliesCriticalTotal: number;
  anomaliesHighTotal: number;
  anomaliesResolvedTotal: number;
  anomaliesAcknowledgedTotal: number;
  falsePositivesTotal: number;
  insufficientDataTotal: number;
  detectionErrorsTotal: number;
  averageDetectionTimeMsAvg: number;
};

/**
 * In-process counters for the AI Supervisor's Groq usage — bridged with Prometheus MetricsService
 * for real-time dashboard observability and alerting.
 */
@Injectable()
export class AiMetricsService {
  constructor(@Optional() private readonly metricsService?: MetricsService) {}

  private groqRequestsTotal = 0;
  private groqSuccessTotal = 0;
  private groq429Total = 0;
  private groqErrorTotal = 0;
  private groqFallbackTotal = 0;
  private cacheHitsTotal = 0;
  private cacheMissesTotal = 0;
  private circuitBreakerOpenTotal = 0;
  private circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private latencySumMs = 0;
  private latencyCount = 0;
  private anomalyDetectionRunsTotal = 0;
  private anomaliesDetectedTotal = 0;
  private anomaliesCriticalTotal = 0;
  private anomaliesHighTotal = 0;
  private anomaliesResolvedTotal = 0;
  private anomaliesAcknowledgedTotal = 0;
  private falsePositivesTotal = 0;
  private insufficientDataTotal = 0;
  private detectionErrorsTotal = 0;
  private detectionLatencySumMs = 0;
  private detectionLatencyCount = 0;

  incrGroqRequest(): void {
    this.groqRequestsTotal++;
  }

  incrGroqSuccess(latencyMs: number): void {
    this.groqSuccessTotal++;
    this.latencySumMs += latencyMs;
    this.latencyCount++;
    this.metricsService?.recordAiRequest('groq', 'success');
  }

  incrGroq429(): void {
    this.groq429Total++;
    this.metricsService?.recordSecurityEvent('groq_429_rate_limit', 'ai-supervisor');
  }

  incrGroqError(): void {
    this.groqErrorTotal++;
    this.metricsService?.recordAiRequest('groq', 'error');
  }

  incrGroqFallback(): void {
    this.groqFallbackTotal++;
    this.metricsService?.recordAiRequest('groq', 'fallback');
  }

  incrCacheHit(): void {
    this.cacheHitsTotal++;
  }

  incrCacheMiss(): void {
    this.cacheMissesTotal++;
  }

  incrAnomalyDetectionRun(): void {
    this.anomalyDetectionRunsTotal++;
  }

  incrAnomalyDetected(): void {
    this.anomaliesDetectedTotal++;
    this.metricsService?.recordSecurityEvent('anomaly_detected', 'ai-supervisor');
  }

  incrAnomalyCritical(): void {
    this.anomaliesCriticalTotal++;
    this.metricsService?.recordSecurityEvent('critical_anomaly_detected', 'ai-supervisor');
  }

  incrAnomalyHigh(): void {
    this.anomaliesHighTotal++;
  }

  incrAnomaliesResolved(): void {
    this.anomaliesResolvedTotal++;
  }

  incrAnomaliesAcknowledged(): void {
    this.anomaliesAcknowledgedTotal++;
  }

  incrFalsePositives(): void {
    this.falsePositivesTotal++;
  }

  incrInsufficientData(): void {
    this.insufficientDataTotal++;
  }

  incrDetectionErrors(): void {
    this.detectionErrorsTotal++;
  }

  recordAnomalyDetectionLatency(latencyMs: number): void {
    this.detectionLatencySumMs += latencyMs;
    this.detectionLatencyCount++;
  }

  recordCircuitBreakerState(state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'): void {
    if (state === 'OPEN' && this.circuitBreakerState !== 'OPEN') {
      this.circuitBreakerOpenTotal++;
    }
    this.circuitBreakerState = state;
    this.metricsService?.setAiCircuitBreakerStatus('groq', state === 'OPEN');
  }

  snapshot(): AiMetricsSnapshot {
    return {
      groqRequestsTotal: this.groqRequestsTotal,
      groqSuccessTotal: this.groqSuccessTotal,
      groq429Total: this.groq429Total,
      groqErrorTotal: this.groqErrorTotal,
      groqFallbackTotal: this.groqFallbackTotal,
      cacheHitsTotal: this.cacheHitsTotal,
      cacheMissesTotal: this.cacheMissesTotal,
      circuitBreakerOpenTotal: this.circuitBreakerOpenTotal,
      circuitBreakerState: this.circuitBreakerState,
      groqLatencyMsAvg: this.latencyCount > 0 ? Math.round(this.latencySumMs / this.latencyCount) : 0,
      anomalyDetectionRunsTotal: this.anomalyDetectionRunsTotal,
      anomaliesDetectedTotal: this.anomaliesDetectedTotal,
      anomaliesCriticalTotal: this.anomaliesCriticalTotal,
      anomaliesHighTotal: this.anomaliesHighTotal,
      anomaliesResolvedTotal: this.anomaliesResolvedTotal,
      anomaliesAcknowledgedTotal: this.anomaliesAcknowledgedTotal,
      falsePositivesTotal: this.falsePositivesTotal,
      insufficientDataTotal: this.insufficientDataTotal,
      detectionErrorsTotal: this.detectionErrorsTotal,
      averageDetectionTimeMsAvg: this.detectionLatencyCount > 0 ? Math.round(this.detectionLatencySumMs / this.detectionLatencyCount) : 0,
    };
  }
}
