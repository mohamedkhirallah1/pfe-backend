export type GeoPoint = { lat: number; lng: number };

const EARTH_RADIUS_KM = 6371;

export function haversineDistanceKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export type GeoCluster = {
  center: GeoPoint;
  pointCount: number;
  points: GeoPoint[];
};

/**
 * Simple fixed-size grid clustering (no external ML dependency): buckets points into
 * `cellSizeKm`-wide cells and returns each non-empty cell as a cluster. Good enough to find
 * high-density areas / coverage holes without pulling in a k-means library for a periodic
 * background job — precision beyond "which ~cellSizeKm neighborhood" isn't needed here.
 */
export function gridCluster(points: GeoPoint[], cellSizeKm = 5): GeoCluster[] {
  if (points.length === 0) {
    return [];
  }

  const kmPerDegreeLat = 111;
  const cellDegLat = cellSizeKm / kmPerDegreeLat;

  const buckets = new Map<string, GeoPoint[]>();
  for (const point of points) {
    const kmPerDegreeLng = 111 * Math.cos((point.lat * Math.PI) / 180) || 1;
    const cellDegLng = cellSizeKm / kmPerDegreeLng;
    const cellX = Math.floor(point.lng / cellDegLng);
    const cellY = Math.floor(point.lat / cellDegLat);
    const key = `${cellX}:${cellY}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(point);
    } else {
      buckets.set(key, [point]);
    }
  }

  return Array.from(buckets.values()).map((bucketPoints) => ({
    center: {
      lat: bucketPoints.reduce((sum, p) => sum + p.lat, 0) / bucketPoints.length,
      lng: bucketPoints.reduce((sum, p) => sum + p.lng, 0) / bucketPoints.length,
    },
    pointCount: bucketPoints.length,
    points: bucketPoints,
  }));
}

/** Distance in km from a point to the nearest of a set of reference points (infrastructure). */
export function nearestDistanceKm(point: GeoPoint, references: GeoPoint[]): number | null {
  if (references.length === 0) {
    return null;
  }
  return Math.min(...references.map((ref) => haversineDistanceKm(point, ref)));
}
