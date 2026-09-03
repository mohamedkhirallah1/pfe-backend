/**
 * Step 1 + 2: read-only inspection of the current database. Never writes anything.
 * Prints entity counts, samples, and a full inconsistency report (orphans, duplicates,
 * invalid coordinates/references) so the migration plan is based on real data, not assumptions.
 */
import { MongoClient } from 'mongodb';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart_fiber';

type AnyDoc = Record<string, any>;

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db();
  console.log(`Connected to ${MONGO_URI}\n`);

  const collections = await db.listCollections().toArray();
  console.log('=== COLLECTIONS PRESENT ===');
  for (const c of collections) {
    const count = await db.collection(c.name).countDocuments();
    console.log(`  ${c.name.padEnd(25)} ${fmt(count)} document(s)`);
  }

  const centrales = await db.collection('centrales').find().toArray();
  const nros = await db.collection('nros').find().toArray();
  const fdts = await db.collection('fdts').find().toArray();
  const contracts = await db.collection('contracts').find().toArray();
  const zones = await db.collection('zones').find().toArray();
  const reclamations = await db.collection('reclamations').find().toArray();

  console.log('\n=== STEP 1: FTTH ENTITY SUMMARY ===');
  console.log(`Zones:      ${fmt(zones.length)}`);
  console.log(`Centrales:  ${fmt(centrales.length)}`);
  console.log(`NRO:        ${fmt(nros.length)}`);
  console.log(`FDT:        ${fmt(fdts.length)}`);
  console.log(`Contracts:  ${fmt(contracts.length)}`);
  console.log(`Reclamations: ${fmt(reclamations.length)}`);

  console.log('\n--- Sample Centrale ---');
  console.log(JSON.stringify(centrales[0] ?? null, null, 2));
  console.log('\n--- Sample NRO ---');
  console.log(JSON.stringify(nros[0] ?? null, null, 2));
  console.log('\n--- Sample FDT ---');
  console.log(JSON.stringify(fdts[0] ?? null, null, 2));
  console.log('\n--- Sample Contract ---');
  console.log(JSON.stringify(contracts[0] ?? null, null, 2));

  console.log('\n=== STEP 2: CONSISTENCY REPORT ===');

  // --- Orphan NRO (no centraleId, or centraleId points nowhere) ---
  const centraleIds = new Set(centrales.map((c: AnyDoc) => c._id.toString()));
  const orphanNroNoCentrale = nros.filter((n: AnyDoc) => !n.centraleId);
  const orphanNroDangling = nros.filter((n: AnyDoc) => n.centraleId && !centraleIds.has(n.centraleId.toString()));
  console.log(`Orphan NRO (no centraleId):          ${orphanNroNoCentrale.length}`);
  console.log(`Orphan NRO (dangling centraleId):    ${orphanNroDangling.length}`);

  // --- Orphan FDT (no nroId, or nroId points nowhere) ---
  const nroExternalIds = new Set(nros.map((n: AnyDoc) => n.externalId));
  const orphanFdtNoNro = fdts.filter((f: AnyDoc) => !f.nroId);
  const orphanFdtDangling = fdts.filter((f: AnyDoc) => f.nroId && !nroExternalIds.has(f.nroId));
  console.log(`Orphan FDT (no nroId):               ${orphanFdtNoNro.length}`);
  console.log(`Orphan FDT (dangling nroId):         ${orphanFdtDangling.length}`);

  // --- Orphan Contracts (no fdtId, or fdtId points nowhere) ---
  const fdtExternalIds = new Set(fdts.map((f: AnyDoc) => f.externalId));
  const orphanContractNoFdt = contracts.filter((c: AnyDoc) => !c.fdtId);
  const orphanContractDangling = contracts.filter((c: AnyDoc) => c.fdtId && !fdtExternalIds.has(c.fdtId));
  console.log(`Orphan Contracts (no fdtId):         ${orphanContractNoFdt.length}`);
  console.log(`Orphan Contracts (dangling fdtId):   ${orphanContractDangling.length}`);

  // --- Duplicate coordinates ---
  function findDuplicateCoords(docs: AnyDoc[], getCoord: (d: AnyDoc) => [number, number] | null): number {
    const seen = new Map<string, number>();
    for (const d of docs) {
      const coord = getCoord(d);
      if (!coord) continue;
      const key = `${coord[0].toFixed(5)}:${coord[1].toFixed(5)}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    return Array.from(seen.values()).filter((n) => n > 1).length;
  }
  const dupNroCoords = findDuplicateCoords(nros, (n) => n.location?.coordinates ?? null);
  const dupFdtCoords = findDuplicateCoords(fdts, (f) => f.location?.coordinates ?? null);
  const dupContractCoords = findDuplicateCoords(contracts, (c) =>
    typeof c.latitude === 'number' && typeof c.longitude === 'number' ? [c.longitude, c.latitude] : null,
  );
  console.log(`Duplicate GPS coordinate groups - NRO: ${dupNroCoords}, FDT: ${dupFdtCoords}, Contracts: ${dupContractCoords}`);

  // --- Duplicate names within same parent ---
  function findDuplicateNamesWithinParent(docs: AnyDoc[], parentKey: string, nameKey: string): number {
    const seen = new Map<string, Set<string>>();
    let dupes = 0;
    for (const d of docs) {
      const parent = String(d[parentKey] ?? 'none');
      const name = d[nameKey];
      if (!name) continue;
      const set = seen.get(parent) ?? new Set<string>();
      if (set.has(name)) dupes++;
      set.add(name);
      seen.set(parent, set);
    }
    return dupes;
  }
  console.log(`Duplicate NRO names within same Centrale: ${findDuplicateNamesWithinParent(nros, 'centraleId', 'name')}`);

  // --- Invalid coordinates (outside Tunisia bounds) ---
  const TUNISIA_BOUNDS = { minLat: 30.2, maxLat: 37.6, minLng: 7.5, maxLng: 11.7 };
  function isInvalid(lat: number, lng: number): boolean {
    return (
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      Number.isNaN(lat) ||
      Number.isNaN(lng) ||
      lat < TUNISIA_BOUNDS.minLat ||
      lat > TUNISIA_BOUNDS.maxLat ||
      lng < TUNISIA_BOUNDS.minLng ||
      lng > TUNISIA_BOUNDS.maxLng
    );
  }
  const invalidNro = nros.filter((n: AnyDoc) => {
    const c = n.location?.coordinates;
    return !c || isInvalid(c[1], c[0]);
  }).length;
  const invalidFdt = fdts.filter((f: AnyDoc) => {
    const c = f.location?.coordinates;
    return !c || isInvalid(c[1], c[0]);
  }).length;
  const invalidContracts = contracts.filter((c: AnyDoc) => isInvalid(c.latitude, c.longitude)).length;
  console.log(`Invalid/out-of-bounds coordinates - NRO: ${invalidNro}, FDT: ${invalidFdt}, Contracts: ${invalidContracts}`);

  // --- Duplicate IDs (externalId / _id) ---
  function findDupExternalIds(docs: AnyDoc[]): number {
    const seen = new Set<string>();
    let dupes = 0;
    for (const d of docs) {
      if (!d.externalId) continue;
      if (seen.has(d.externalId)) dupes++;
      seen.add(d.externalId);
    }
    return dupes;
  }
  console.log(`Duplicate externalId - NRO: ${findDupExternalIds(nros)}, FDT: ${findDupExternalIds(fdts)}, Contracts: ${findDupExternalIds(contracts)}`);

  await client.close();
  console.log('\nInspection complete. No data was modified.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
