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

export const TUNISIA_ISO_REGION_MAP: Record<string, TunisiaRegion> = {
  'TN-11': 'Tunis',
  'TN-12': 'Ariana',
  'TN-13': 'Ben Arous',
  'TN-14': 'Manouba',
  'TN-21': 'Nabeul',
  'TN-22': 'Zaghouan',
  'TN-23': 'Bizerte',
  'TN-31': 'Beja',
  'TN-32': 'Jendouba',
  'TN-33': 'Le Kef',
  'TN-34': 'Siliana',
  'TN-41': 'Kairouan',
  'TN-42': 'Kasserine',
  'TN-43': 'Sidi Bouzid',
  'TN-51': 'Sousse',
  'TN-52': 'Monastir',
  'TN-53': 'Mahdia',
  'TN-54': 'Sfax',
  'TN-61': 'Gafsa',
  'TN-62': 'Tozeur',
  'TN-63': 'Kebili',
  'TN-71': 'Gabes',
  'TN-72': 'Medenine',
  'TN-73': 'Tataouine',
};

export function normalizeTunisiaRegionName(regionName: string): TunisiaRegion | null {
  if (!regionName || typeof regionName !== 'string') return null;

  const rawUpper = regionName.trim().toUpperCase();
  if (TUNISIA_ISO_REGION_MAP[rawUpper]) {
    return TUNISIA_ISO_REGION_MAP[rawUpper];
  }

  // Also handle without hyphen: e.g. "TN41" -> "TN-41"
  const formattedIso = rawUpper.replace(/^(TN)(\d{2})$/, '$1-$2');
  if (TUNISIA_ISO_REGION_MAP[formattedIso]) {
    return TUNISIA_ISO_REGION_MAP[formattedIso];
  }

  const normalizeToken = (value: string): string =>
    value
      .trim()
      .toLowerCase()
      .replace(/[''\s_-]+/g, '');

  const normalized = normalizeToken(regionName);
  const match = TUNISIA_REGIONS.find((region) => normalizeToken(region) === normalized);
  return match ?? null;
}
