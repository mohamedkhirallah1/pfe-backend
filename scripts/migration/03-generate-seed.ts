/**
 * Step 4 + Final Validation: builds a coherent, realistic FTTH demo dataset entirely in memory
 * (Centrale -> NRO -> FDT -> Contract, plus a curated set of Reclamations for the complaint-
 * cluster demo), validates it exhaustively, prints a full report, and ONLY writes to MongoDB if
 * validation passes with zero issues. Zones and Users are never touched.
 *
 * Usage:
 *   npx ts-node scripts/migration/03-generate-seed.ts             # dry run: generate + validate + print report only
 *   npx ts-node scripts/migration/03-generate-seed.ts --apply      # also replace the DB collections
 *
 * Run 02-backup.ts first. This script refuses to --apply without a backups/ folder present.
 */
import { MongoClient, ObjectId } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart_fiber';
const APPLY = process.argv.includes('--apply');

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) so re-running without --apply reproduces
// an identical dataset — makes the "generate, review, then apply" workflow safe.
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  let a = seed;
  return function random(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260804);
const randFloat = (min: number, max: number) => min + rng() * (max - min);
const randInt = (min: number, max: number) => Math.floor(randFloat(min, max + 1));
const pick = <T,>(arr: readonly T[]): T => arr[randInt(0, arr.length - 1)];
const chance = (p: number) => rng() < p;

// ---------------------------------------------------------------------------
// Tunisia region centers (must match src/modules/zones/constants — kept in
// sync manually since this is a standalone script, not a Nest provider).
// ---------------------------------------------------------------------------
const REGION_CENTERS: Record<string, { lat: number; lng: number }> = {
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

const CENTRALE_GROUPS: Array<{ code: string; hub: string; regions: string[] }> = [
  { code: 'CO-TUN-01', hub: 'Tunis', regions: ['Tunis', 'Ariana', 'Ben Arous', 'Manouba'] },
  { code: 'CO-CAP-01', hub: 'Nabeul', regions: ['Nabeul', 'Zaghouan', 'Bizerte', 'Beja'] },
  { code: 'CO-NO-01', hub: 'Jendouba', regions: ['Jendouba', 'Le Kef', 'Siliana', 'Kairouan'] },
  { code: 'CO-SAH-01', hub: 'Sousse', regions: ['Sousse', 'Monastir', 'Mahdia', 'Sfax'] },
  { code: 'CO-CTR-01', hub: 'Gafsa', regions: ['Kasserine', 'Sidi Bouzid', 'Gafsa', 'Tozeur'] },
  { code: 'CO-SUD-01', hub: 'Gabes', regions: ['Kebili', 'Gabes', 'Medenine', 'Tataouine'] },
];

const HUB_REGIONS = new Set(['Tunis', 'Sfax', 'Sousse', 'Ariana']);
const COMPLAINT_CLUSTER_REGIONS = ['Sfax', 'Kasserine'];

// ---------------------------------------------------------------------------
// Geo helpers
// ---------------------------------------------------------------------------
function haversineKm(a: [number, number], b: [number, number]): number {
  // a, b are [lng, lat]
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const usedCoordKeys = new Set<string>();
function jitterAround(center: { lat: number; lng: number }, maxKm: number): [number, number] {
  // Uniform random point within a maxKm radius disc, with a coordinate-collision nudge loop.
  for (let attempt = 0; attempt < 20; attempt++) {
    const radiusKm = randFloat(0.05, maxKm);
    const angle = randFloat(0, 2 * Math.PI);
    const dLat = (radiusKm / 111) * Math.cos(angle);
    const dLng = (radiusKm / (111 * Math.cos((center.lat * Math.PI) / 180))) * Math.sin(angle);
    const lat = Math.round((center.lat + dLat) * 1e6) / 1e6;
    const lng = Math.round((center.lng + dLng) * 1e6) / 1e6;
    const key = `${lng.toFixed(6)}:${lat.toFixed(6)}`;
    if (!usedCoordKeys.has(key)) {
      usedCoordKeys.add(key);
      return [lng, lat];
    }
  }
  throw new Error('Could not find a non-duplicate coordinate after 20 attempts');
}

// ---------------------------------------------------------------------------
// ID / name generators
// ---------------------------------------------------------------------------
let phoneCounter = 100000;
const PHONE_PREFIXES = ['20', '21', '22', '23', '25', '50', '52', '54', '55', '56', '58', '90', '92', '93', '94', '95', '97', '98'];
function nextPhoneNumber(): string {
  phoneCounter += 1;
  const prefix = pick(PHONE_PREFIXES);
  const suffix = String(phoneCounter).slice(-6).padStart(6, '0');
  return `${prefix}${suffix}`;
}
function randomCin(): string {
  return String(randInt(10000000, 19999999));
}
function randomDateWithinDays(daysAgoMax: number, daysAgoMin = 0): Date {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  return new Date(now - randInt(daysAgoMin, daysAgoMax) * day);
}

// ---------------------------------------------------------------------------
// Types (loose — this is a standalone data generator, not the Nest app)
// ---------------------------------------------------------------------------
type Doc = Record<string, any>;

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db();
  console.log(`Connected to ${MONGO_URI} (mode: ${APPLY ? 'APPLY' : 'DRY RUN'})\n`);

  // Zones are pre-existing (seeded by ZonesService on app boot) and are NOT touched by this
  // migration — we only read them to resolve region -> zoneId.
  const zoneDocs = await db.collection('zones').find({ isActive: true }).toArray();
  const zoneIdByName = new Map<string, string>(zoneDocs.map((z: Doc) => [z.name, z._id.toString()]));

  const missingZones = Object.keys(REGION_CENTERS).filter((r) => !zoneIdByName.has(r));
  if (missingZones.length > 0) {
    throw new Error(
      `Cannot generate dataset: the following zones don't exist in the DB yet (start the app once to let ZonesService seed them): ${missingZones.join(', ')}`,
    );
  }

  // =========================================================================
  // CENTRALES
  // =========================================================================
  const centrales: Doc[] = CENTRALE_GROUPS.map((group) => {
    const hubCenter = REGION_CENTERS[group.hub];
    return {
      _id: new ObjectId(),
      nom: `Centrale ${group.hub}`,
      code: group.code,
      ville: group.hub,
      regionId: new ObjectId(zoneIdByName.get(group.hub)),
      position: { type: 'Point', coordinates: [hubCenter.lng, hubCenter.lat] },
      capaciteTotal: 0, // filled in after NROs are generated
      oltIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      __group: group, // stripped before insert
    };
  });
  const centraleByRegion = new Map<string, Doc>();
  for (const c of centrales) {
    for (const r of (c.__group as typeof CENTRALE_GROUPS[number]).regions) {
      centraleByRegion.set(r, c);
    }
  }

  // =========================================================================
  // NRO — saturation distribution designed to cover the full demo spectrum
  // requested: healthy / medium / elevated / high(90) / critical(95) / overloaded(>100).
  // =========================================================================
  const regionList = Object.keys(REGION_CENTERS);
  const totalNroCount = regionList.reduce((sum, r) => sum + (HUB_REGIONS.has(r) ? 3 : 2), 0);
  const saturationBands: number[] = [];
  // Explicit anchors requested in the brief:
  saturationBands.push(40, 60, 75, 90, 95);
  while (saturationBands.length < totalNroCount - 3) {
    const band = pick(['healthy', 'medium', 'elevated', 'high']);
    if (band === 'healthy') saturationBands.push(randInt(15, 38));
    else if (band === 'medium') saturationBands.push(randInt(40, 62));
    else if (band === 'elevated') saturationBands.push(randInt(63, 85));
    else saturationBands.push(randInt(86, 99));
  }
  // A couple of genuinely overloaded NROs (>100%) to exercise NroStatus.SATURATED end-to-end.
  saturationBands.push(103, 108, 101);
  // shuffle deterministically
  for (let i = saturationBands.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [saturationBands[i], saturationBands[j]] = [saturationBands[j], saturationBands[i]];
  }

  const NRO_CAPACITY_TIERS = [300, 400, 500, 600, 800];
  const nros: Doc[] = [];
  let saturationCursor = 0;

  for (const region of regionList) {
    const centrale = centraleByRegion.get(region)!;
    const center = REGION_CENTERS[region];
    const count = HUB_REGIONS.has(region) ? 3 : 2;
    const suffixes = ['Nord', 'Sud', 'Centre'];

    for (let i = 0; i < count; i++) {
      const maxCapacity = pick(NRO_CAPACITY_TIERS);
      const targetPct = Math.min(115, saturationBands[saturationCursor++]);
      const currentLoad = Math.round((maxCapacity * targetPct) / 100);
      const [lng, lat] = jitterAround(center, 4.5);
      const isDown = false; // reserved: could flip one NRO to DOWN for health-demo variety
      const status = isDown ? 'DOWN' : currentLoad >= maxCapacity ? 'SATURATED' : 'ACTIVE';
      const statutSaturation = targetPct < 70 ? 'NORMAL' : targetPct <= 100 ? 'CHARGE' : 'SATURE';

      nros.push({
        _id: new ObjectId(),
        externalId: `NRO-${region.toUpperCase().replace(/\s+/g, '')}-${String(i + 1).padStart(2, '0')}`,
        name: `NRO ${region} ${suffixes[i]}`,
        regionId: zoneIdByName.get(region), // Zone ObjectId as string — fixes the old dataset's inconsistency (it stored a bare region code here)
        centraleId: centrale._id,
        location: { type: 'Point', coordinates: [lng, lat] },
        maxCapacity,
        currentLoad,
        capacityGb: maxCapacity,
        capaciteUtilisee: currentLoad,
        usedGb: currentLoad,
        performanceScore: Math.max(35, Math.round(100 - targetPct * 0.55)),
        status,
        statutSaturation,
        tauxSaturation: targetPct,
        connectedFdtsCount: 0, // filled in after FDT generation
        lastEventType: 'SEED_MIGRATION',
        installationDate: randomDateWithinDays(1100, 200), // extra field, not in the Mongoose schema (never surfaced by the API) but a valid stored attribute per the brief
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  // =========================================================================
  // FDT — 2 to 5 per NRO, with intentionally overloaded ones for the demo.
  // =========================================================================
  const FDT_PORT_TIERS = [8, 16, 32, 64];
  const fdts: Doc[] = [];

  for (const nro of nros) {
    const fdtCount = randInt(2, 5);
    const nroCenter = { lat: nro.location.coordinates[1], lng: nro.location.coordinates[0] };

    for (let i = 0; i < fdtCount; i++) {
      const nbPortsTotal = pick(FDT_PORT_TIERS);
      // FDT occupation loosely tracks its parent NRO's saturation band, plus noise, so a
      // saturated NRO plausibly has saturated FDTs under it rather than being independent.
      const occupationPct = Math.max(5, Math.min(100, Math.round(nro.tauxSaturation * randFloat(0.7, 1.15))));
      const nbPortsUtilises = Math.min(nbPortsTotal, Math.round((nbPortsTotal * occupationPct) / 100));
      const [lng, lat] = jitterAround(nroCenter, 1.8);
      const statutFdt = occupationPct < 70 ? 'DISPONIBLE' : occupationPct < 100 ? 'CHARGE' : 'PLEIN';
      const status = nbPortsUtilises >= nbPortsTotal ? 'SATURATED' : 'ACTIVE';

      fdts.push({
        _id: new ObjectId(),
        externalId: `${nro.externalId}-FDT-${String(i + 1).padStart(2, '0')}`,
        nroId: nro.externalId,
        centraleId: nro.centraleId,
        regionId: nro.regionId,
        location: { type: 'Point', coordinates: [lng, lat] },
        maxClients: nbPortsTotal,
        activeClients: 0, // filled in after Contracts are generated (= count of ACTIVE contracts)
        signalQuality: Math.max(60, Math.round(99 - occupationPct * 0.3)),
        status,
        nbPortsTotal,
        nbPortsUtilises,
        statutFdt,
        installationDate: randomDateWithinDays(1000, 150),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    nro.connectedFdtsCount = fdtCount;
  }

  // =========================================================================
  // CONTRACTS — distributed geographically around each FDT.
  // =========================================================================
  const PACKAGES = [20, 50, 100, 200, 500];
  const contracts: Doc[] = [];

  for (const fdt of fdts) {
    const fdtCenter = { lat: fdt.location.coordinates[1], lng: fdt.location.coordinates[0] };
    const occupationPct = fdt.nbPortsTotal > 0 ? (fdt.nbPortsUtilises / fdt.nbPortsTotal) * 100 : 0;
    const activeCount = Math.max(1, Math.min(18, Math.round(2 + (occupationPct / 100) * 14)));
    const cancelledCount = chance(0.25) ? randInt(1, 2) : 0;
    const failedCount = chance(0.15) ? 1 : 0;
    const isRecentGrowth = occupationPct >= 80;
    const isBusinessArea = HUB_REGIONS.has(regionList.find((r) => zoneIdByName.get(r) === fdt.regionId) ?? '');

    let seq = 0;
    const makeContract = (status: 'ACTIVE' | 'CANCELLED' | 'FAILED') => {
      seq += 1;
      const [lng, lat] = jitterAround(fdtCenter, 0.9);
      const numeroTelephone = nextPhoneNumber();
      const numeroCIN = randomCin();
      const pkg = pick(PACKAGES);
      const typeClient = chance(isBusinessArea ? 0.35 : 0.15)
        ? chance(0.6) ? 'ENTREPRISE' : 'IMMEUBLE'
        : 'MAISON';
      const createdAt = isRecentGrowth ? randomDateWithinDays(180, 0) : randomDateWithinDays(730, 30);
      const installationStatus = status === 'FAILED' ? 'FAILED' : status === 'CANCELLED' ? 'COMPLETED' : chance(0.1) ? 'IN_PROGRESS' : 'COMPLETED';

      contracts.push({
        _id: new ObjectId(),
        externalId: `CTR-${fdt.externalId}-${String(seq).padStart(3, '0')}`,
        location: { type: 'Point', coordinates: [lng, lat] },
        numeroTelephone,
        numeroCIN,
        phoneNumber: numeroTelephone,
        cin: numeroCIN,
        status,
        latitude: lat,
        longitude: lng,
        bandwidth: pkg,
        offreGB: pkg,
        packageGb: pkg,
        zoneId: fdt.regionId,
        nroId: fdt.nroId,
        fdtId: fdt.externalId,
        centraleId: fdt.centraleId,
        regionId: fdt.regionId,
        typeClient,
        installationStatus,
        traceFDT: {
          type: 'LineString',
          coordinates: [
            [fdt.location.coordinates[0], fdt.location.coordinates[1]],
            [lng, lat],
          ],
        },
        createdAt,
        updatedAt: createdAt,
      });
    };

    for (let i = 0; i < activeCount; i++) makeContract('ACTIVE');
    for (let i = 0; i < cancelledCount; i++) makeContract('CANCELLED');
    for (let i = 0; i < failedCount; i++) makeContract('FAILED');

    fdt.activeClients = activeCount;
  }

  // Recompute Centrale.capaciteTotal from its NROs, with ~15% operational headroom.
  for (const centrale of centrales) {
    const owned = nros.filter((n) => n.centraleId.equals(centrale._id));
    centrale.capaciteTotal = Math.round(owned.reduce((sum, n) => sum + n.maxCapacity, 0) * 1.15);
  }

  // =========================================================================
  // RECLAMATIONS — background noise + one deliberate complaint-spike cluster
  // in COMPLAINT_CLUSTER_REGIONS, for the AI Supervisor's complaint-intelligence demo.
  // =========================================================================
  const RECLAMATION_TYPES = ['COUPURE', 'FAIBLE_DEBIT', 'REINITIALISATION'] as const;
  const reclamations: Doc[] = [];
  let reclCounter = 0;

  function makeReclamation(contract: Doc, opts: { recent: boolean; forcedType?: (typeof RECLAMATION_TYPES)[number] }) {
    reclCounter += 1;
    const type = opts.forcedType ?? pick(RECLAMATION_TYPES);
    const category = type === 'COUPURE' ? 'panne' : type === 'FAIBLE_DEBIT' ? 'debit' : 'installation';
    const priority = type === 'COUPURE' ? 'high' : type === 'FAIBLE_DEBIT' ? 'medium' : 'low';
    const recommendation =
      type === 'COUPURE'
        ? 'Envoyer une equipe terrain immediatement et verifier le backbone local.'
        : type === 'FAIBLE_DEBIT'
          ? 'Diagnostiquer le point de terminaison puis escalader si recurrent.'
          : 'Planifier une reinitialisation a distance puis confirmer avec le client.';
    const [lng, lat] = [contract.longitude + randFloat(-0.003, 0.003), contract.latitude + randFloat(-0.003, 0.003)];

    reclamations.push({
      _id: new ObjectId(),
      externalId: `REC-${String(reclCounter).padStart(5, '0')}`,
      phoneNumber: contract.phoneNumber,
      numeroCIN: contract.numeroCIN,
      cin: contract.cin,
      description: `${type} signalee par le client`,
      typeReclamation: type,
      status: chance(0.4) ? 'NEW' : chance(0.5) ? 'IN_PROGRESS' : 'RESOLVED',
      latitude: lat,
      longitude: lng,
      zoneId: contract.zoneId,
      nroId: contract.nroId,
      contractId: contract._id.toString(),
      regionId: contract.regionId,
      category,
      priority,
      recommendation,
      actionType: type === 'COUPURE' && chance(0.3) ? pick(['TECHNICIEN', 'NOUVEAU_FDT'] as const) : undefined,
      urgence: type === 'COUPURE' && chance(0.4),
      createdAt: opts.recent ? randomDateWithinDays(9, 0) : randomDateWithinDays(90, 10),
    });
  }

  // Deliberate spike: concentrate complaints on contracts within the two cluster regions.
  for (const region of COMPLAINT_CLUSTER_REGIONS) {
    const zoneId = zoneIdByName.get(region);
    const regionContracts = contracts.filter((c) => c.zoneId === zoneId && c.status === 'ACTIVE');
    const spikeSize = Math.min(regionContracts.length, randInt(12, 20));
    for (let i = 0; i < spikeSize; i++) {
      makeReclamation(pick(regionContracts), { recent: true, forcedType: chance(0.7) ? 'COUPURE' : 'FAIBLE_DEBIT' });
    }
  }

  // Background baseline across all other active contracts.
  const activeContracts = contracts.filter((c) => c.status === 'ACTIVE');
  for (let i = 0; i < 15; i++) {
    makeReclamation(pick(activeContracts), { recent: false });
  }

  // =========================================================================
  // VALIDATION — must pass with zero issues before any write happens.
  // =========================================================================
  const issues: string[] = [];

  const centraleIds = new Set(centrales.map((c) => c._id.toString()));
  const nroExternalIds = new Set(nros.map((n) => n.externalId));
  const fdtExternalIds = new Set(fdts.map((f) => f.externalId));
  const zoneIdSet = new Set(zoneDocs.map((z: Doc) => z._id.toString()));

  // Referential integrity, hop by hop.
  for (const nro of nros) {
    if (!centraleIds.has(nro.centraleId.toString())) issues.push(`NRO ${nro.externalId}: centraleId does not resolve to a generated Centrale`);
    if (!zoneIdSet.has(nro.regionId)) issues.push(`NRO ${nro.externalId}: regionId does not resolve to an existing Zone`);
  }
  for (const fdt of fdts) {
    if (!nroExternalIds.has(fdt.nroId)) issues.push(`FDT ${fdt.externalId}: nroId does not resolve to a generated NRO`);
    if (!centraleIds.has(fdt.centraleId.toString())) issues.push(`FDT ${fdt.externalId}: centraleId does not resolve to a generated Centrale`);
    if (!zoneIdSet.has(fdt.regionId)) issues.push(`FDT ${fdt.externalId}: regionId does not resolve to an existing Zone`);
  }
  for (const contract of contracts) {
    if (!fdtExternalIds.has(contract.fdtId)) issues.push(`Contract ${contract.externalId}: fdtId does not resolve to a generated FDT`);
    if (!nroExternalIds.has(contract.nroId)) issues.push(`Contract ${contract.externalId}: nroId does not resolve to a generated NRO`);
    if (!centraleIds.has(contract.centraleId.toString())) issues.push(`Contract ${contract.externalId}: centraleId does not resolve to a generated Centrale`);
    if (!zoneIdSet.has(contract.zoneId)) issues.push(`Contract ${contract.externalId}: zoneId does not resolve to an existing Zone`);
  }

  // Duplicate IDs.
  function checkDupIds(docs: Doc[], label: string) {
    const seen = new Set<string>();
    for (const d of docs) {
      if (seen.has(d.externalId)) issues.push(`Duplicate externalId in ${label}: ${d.externalId}`);
      seen.add(d.externalId);
    }
  }
  checkDupIds(nros, 'NRO');
  checkDupIds(fdts, 'FDT');
  checkDupIds(contracts, 'Contracts');

  // Duplicate names within the same parent.
  const nroNamesByCentrale = new Map<string, Set<string>>();
  for (const nro of nros) {
    const key = nro.centraleId.toString();
    const set = nroNamesByCentrale.get(key) ?? new Set<string>();
    if (set.has(nro.name)) issues.push(`Duplicate NRO name "${nro.name}" within Centrale ${key}`);
    set.add(nro.name);
    nroNamesByCentrale.set(key, set);
  }

  // Duplicate coordinates (global, since usedCoordKeys already enforced uniqueness at
  // generation time — this re-checks independently in case that invariant regresses).
  function checkDupCoords(docs: Doc[], getCoord: (d: Doc) => [number, number], label: string) {
    const seen = new Set<string>();
    for (const d of docs) {
      const [lng, lat] = getCoord(d);
      const key = `${lng.toFixed(6)}:${lat.toFixed(6)}`;
      if (seen.has(key)) issues.push(`Duplicate coordinates in ${label}: ${key}`);
      seen.add(key);
    }
  }
  checkDupCoords(nros, (d) => d.location.coordinates, 'NRO');
  checkDupCoords(fdts, (d) => d.location.coordinates, 'FDT');
  checkDupCoords(contracts, (d) => [d.longitude, d.latitude], 'Contracts');

  // Geographic coherence: Contract near its FDT, FDT near its NRO, NRO inside Centrale's group.
  const nroByExternalId = new Map(nros.map((n) => [n.externalId, n]));
  const fdtByExternalId = new Map(fdts.map((f) => [f.externalId, f]));
  for (const fdt of fdts) {
    const nro = nroByExternalId.get(fdt.nroId)!;
    const distKm = haversineKm(nro.location.coordinates, fdt.location.coordinates);
    if (distKm > 5) issues.push(`FDT ${fdt.externalId} is ${distKm.toFixed(1)}km from its NRO ${nro.externalId} (expected <5km)`);
  }
  for (const contract of contracts) {
    const fdt = fdtByExternalId.get(contract.fdtId)!;
    const distKm = haversineKm(fdt.location.coordinates, [contract.longitude, contract.latitude]);
    if (distKm > 2) issues.push(`Contract ${contract.externalId} is ${distKm.toFixed(1)}km from its FDT ${fdt.externalId} (expected <2km)`);
  }

  // Invalid coordinates (Tunisia bounds).
  const BOUNDS = { minLat: 30.2, maxLat: 37.6, minLng: 7.5, maxLng: 11.7 };
  function checkBounds(lat: number, lng: number, label: string) {
    if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lng < BOUNDS.minLng || lng > BOUNDS.maxLng) {
      issues.push(`${label}: coordinates (${lat}, ${lng}) fall outside Tunisia bounds`);
    }
  }
  for (const nro of nros) checkBounds(nro.location.coordinates[1], nro.location.coordinates[0], `NRO ${nro.externalId}`);
  for (const fdt of fdts) checkBounds(fdt.location.coordinates[1], fdt.location.coordinates[0], `FDT ${fdt.externalId}`);
  for (const contract of contracts) checkBounds(contract.latitude, contract.longitude, `Contract ${contract.externalId}`);

  // =========================================================================
  // REPORT
  // =========================================================================
  console.log('=== STEP 4: GENERATED DATASET SUMMARY ===');
  console.log(`Centrales:     ${centrales.length}`);
  console.log(`NRO:           ${nros.length}`);
  console.log(`FDT:           ${fdts.length}`);
  console.log(`Contracts:     ${contracts.length} (${contracts.filter((c) => c.status === 'ACTIVE').length} active, ${contracts.filter((c) => c.status === 'CANCELLED').length} cancelled, ${contracts.filter((c) => c.status === 'FAILED').length} failed)`);
  console.log(`Reclamations:  ${reclamations.length} (complaint cluster in: ${COMPLAINT_CLUSTER_REGIONS.join(', ')})`);

  console.log('\n--- NRO saturation distribution ---');
  const tiers = [
    ['healthy (<40%)', nros.filter((n) => n.tauxSaturation < 40).length],
    ['medium (40-70%)', nros.filter((n) => n.tauxSaturation >= 40 && n.tauxSaturation < 70).length],
    ['elevated (70-90%)', nros.filter((n) => n.tauxSaturation >= 70 && n.tauxSaturation < 90).length],
    ['high (90-100%)', nros.filter((n) => n.tauxSaturation >= 90 && n.tauxSaturation <= 100).length],
    ['overloaded (>100%)', nros.filter((n) => n.tauxSaturation > 100).length],
  ] as const;
  for (const [label, count] of tiers) console.log(`  ${label.padEnd(20)} ${count}`);

  console.log('\n--- FDT status distribution ---');
  console.log(`  DISPONIBLE: ${fdts.filter((f) => f.statutFdt === 'DISPONIBLE').length}`);
  console.log(`  CHARGE:     ${fdts.filter((f) => f.statutFdt === 'CHARGE').length}`);
  console.log(`  PLEIN:      ${fdts.filter((f) => f.statutFdt === 'PLEIN').length}`);

  console.log('\n=== FINAL VALIDATION REPORT ===');
  if (issues.length === 0) {
    console.log('PASS — 0 issues found across referential integrity, duplicates, geography, and bounds checks.');
  } else {
    console.log(`FAIL — ${issues.length} issue(s) found:`);
    for (const issue of issues.slice(0, 50)) console.log(`  - ${issue}`);
    if (issues.length > 50) console.log(`  ... and ${issues.length - 50} more`);
  }

  if (issues.length > 0) {
    console.log('\nRefusing to write to the database: fix the generator and re-run.');
    await client.close();
    process.exit(1);
  }

  if (!APPLY) {
    console.log('\nDRY RUN complete — no data was written. Re-run with --apply to replace the database collections.');
    await client.close();
    return;
  }

  const backupsDir = path.join(__dirname, '..', '..', 'backups');
  if (!fs.existsSync(backupsDir) || fs.readdirSync(backupsDir).length === 0) {
    console.log('\nRefusing to --apply: no backup found under /backups. Run 02-backup.ts first.');
    await client.close();
    process.exit(1);
  }

  console.log('\n=== APPLYING: replacing database collections ===');
  const cleanCentrales = centrales.map(({ __group, ...rest }) => rest);

  await db.collection('centrales').deleteMany({});
  await db.collection('nros').deleteMany({});
  await db.collection('fdts').deleteMany({});
  await db.collection('contracts').deleteMany({});
  await db.collection('reclamations').deleteMany({});
  await db.collection('notifications').deleteMany({});
  await db.collection('ai_recommendations').deleteMany({});
  await db.collection('ai_alerts').deleteMany({});
  await db.collection('ai_executive_reports').deleteMany({});
  await db.collection('ai_network_snapshots').deleteMany({});
  console.log('Old data cleared (centrales, nros, fdts, contracts, reclamations, notifications, ai_* history).');

  if (cleanCentrales.length) await db.collection('centrales').insertMany(cleanCentrales);
  if (nros.length) await db.collection('nros').insertMany(nros);
  if (fdts.length) await db.collection('fdts').insertMany(fdts);
  if (contracts.length) await db.collection('contracts').insertMany(contracts);
  if (reclamations.length) await db.collection('reclamations').insertMany(reclamations);
  console.log('New dataset inserted.');

  // Re-read from the DB to confirm what actually landed (not just what we intended to insert).
  const finalCounts = {
    centrales: await db.collection('centrales').countDocuments(),
    nros: await db.collection('nros').countDocuments(),
    fdts: await db.collection('fdts').countDocuments(),
    contracts: await db.collection('contracts').countDocuments(),
    reclamations: await db.collection('reclamations').countDocuments(),
  };
  console.log('\n--- Post-insert counts (read back from MongoDB) ---');
  console.log(finalCounts);

  await client.close();
  console.log('\nMigration complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
