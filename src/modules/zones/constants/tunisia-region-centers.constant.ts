import { TUNISIA_REGIONS, TunisiaRegion } from '../../users/constants/tunisia-regions.constant';

type RegionCenter = {
  lat: number;
  lng: number;
};

export const TUNISIA_REGION_CENTERS: Record<TunisiaRegion, RegionCenter> = {
  Tunis: { lat: 36.8065, lng: 10.1815 },
  Ariana: { lat: 36.8625, lng: 10.1956 },
  'Ben Arous': { lat: 36.7531, lng: 10.2189 },
  Manouba: { lat: 36.8092, lng: 10.0956 },
  Nabeul: { lat: 36.4513, lng: 10.7356 },
  Zaghouan: { lat: 36.4029, lng: 10.1429 },
  Bizerte: { lat: 37.2744, lng: 9.8739 },
  Beja: { lat: 36.7333, lng: 9.1833 },
  Jendouba: { lat: 36.5011, lng: 8.7802 },
  'Le Kef': { lat: 36.1742, lng: 8.7049 },
  Siliana: { lat: 36.0849, lng: 9.3708 },
  Sousse: { lat: 35.8256, lng: 10.6084 },
  Monastir: { lat: 35.7643, lng: 10.8113 },
  Mahdia: { lat: 35.5047, lng: 11.0622 },
  Kairouan: { lat: 35.6781, lng: 10.0963 },
  Kasserine: { lat: 35.1676, lng: 8.8365 },
  'Sidi Bouzid': { lat: 35.0382, lng: 9.4849 },
  Sfax: { lat: 34.7406, lng: 10.7603 },
  Gafsa: { lat: 34.425, lng: 8.7842 },
  Tozeur: { lat: 33.9197, lng: 8.1335 },
  Kebili: { lat: 33.7044, lng: 8.969 },
  Gabes: { lat: 33.8815, lng: 10.0982 },
  Medenine: { lat: 33.3549, lng: 10.5055 },
  Tataouine: { lat: 32.9297, lng: 10.4518 },
};

export function normalizeTunisiaRegionName(regionName: string): TunisiaRegion | null {
  const normalizeToken = (value: string): string =>
    value
      .trim()
      .toLowerCase()
      .replace(/[''\s_-]+/g, '');

  const normalized = normalizeToken(regionName);
  const match = TUNISIA_REGIONS.find((region) => normalizeToken(region) === normalized);
  return match ?? null;
}
