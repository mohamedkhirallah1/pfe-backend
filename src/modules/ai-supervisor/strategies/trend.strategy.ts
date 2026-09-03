export type TimeSeriesPoint = { timestampMs: number; value: number };

export type TrendForecast = {
  slopePerDay: number;
  r2: number;
  forecasts: Array<{ horizonDays: 30 | 60 | 90; predictedValue: number }>;
  confidence: number; // 0-1, scales with sample size and fit quality
};

/**
 * Ordinary least-squares linear regression over (day, value) points, extrapolated to
 * 30/60/90 days ahead. No external stats library: this is a background job running on a
 * handful of points (snapshots), not a data-science pipeline — a closed-form OLS fit is
 * exact and trivial to reason about/test.
 */
export function linearTrendForecast(points: TimeSeriesPoint[]): TrendForecast | null {
  if (points.length < 2) {
    return null;
  }

  const sorted = [...points].sort((a, b) => a.timestampMs - b.timestampMs);
  const t0 = sorted[0].timestampMs;
  const xs = sorted.map((p) => (p.timestampMs - t0) / (1000 * 60 * 60 * 24)); // days since first point
  const ys = sorted.map((p) => p.value);
  const n = xs.length;

  const sumX = xs.reduce((s, x) => s + x, 0);
  const sumY = ys.reduce((s, y) => s + y, 0);
  const meanX = sumX / n;
  const meanY = sumY / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (xs[i] - meanX) * (ys[i] - meanY);
    denominator += (xs[i] - meanX) ** 2;
  }

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = meanY - slope * meanX;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = slope * xs[i] + intercept;
    ssRes += (ys[i] - predicted) ** 2;
    ssTot += (ys[i] - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  const lastX = xs[n - 1];
  const forecasts = ([30, 60, 90] as const).map((horizonDays) => ({
    horizonDays,
    predictedValue: Math.max(0, slope * (lastX + horizonDays) + intercept),
  }));

  // Confidence grows with sample size (caps out around 10+ points) and fit quality (r2).
  const sampleConfidence = Math.min(1, n / 10);
  const confidence = Math.round(sampleConfidence * r2 * 100) / 100;

  return { slopePerDay: slope, r2, forecasts, confidence };
}
