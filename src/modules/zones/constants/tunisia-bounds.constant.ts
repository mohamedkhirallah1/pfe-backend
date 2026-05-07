export const TUNISIA_BOUNDS = {
  minLat: 30.2,
  maxLat: 37.6,
  minLng: 7.5,
  maxLng: 11.7,
};

export function isWithinTunisiaBounds(latitude: number, longitude: number): boolean {
  return (
    latitude >= TUNISIA_BOUNDS.minLat &&
    latitude <= TUNISIA_BOUNDS.maxLat &&
    longitude >= TUNISIA_BOUNDS.minLng &&
    longitude <= TUNISIA_BOUNDS.maxLng
  );
}
