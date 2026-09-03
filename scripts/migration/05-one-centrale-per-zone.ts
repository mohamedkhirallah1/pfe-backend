/**
 * Gives every zone its own Centrale (previously 6 hub Centrales each administratively served
 * ~4 zones, which conflicted with the "a Centrale belongs to one zone" rule). This is a
 * surgical fix, not a re-seed: existing NRO/FDT/Contract records, coordinates, saturation
 * levels, and complaint clusters are all preserved — only Centrale.centraleId pointers and
 * capaciteTotal are adjusted, plus 18 new zone-specific Centrales are created where missing.
 *
 * Usage:
 *   npx ts-node scripts/migration/05-one-centrale-per-zone.ts            # dry run report only
 *   npx ts-node scripts/migration/05-one-centrale-per-zone.ts --apply     # write changes
 *
 * Run 02-backup.ts first if you want a fresh backup beyond the one already in /backups.
 */
import { MongoClient, ObjectId } from 'mongodb';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart_fiber';
const APPLY = process.argv.includes('--apply');

type Doc = Record<string, any>;

function centraleCode(zoneName: string, used: Set<string>): string {
  const base = 'CO-' + zoneName.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) + '-01';
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let n = 2;
  while (used.has(`CO-${zoneName.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)}-0${n}`)) n++;
  const code = `CO-${zoneName.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)}-0${n}`;
  used.add(code);
  return code;
}

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db();
  console.log(`Connected to ${MONGO_URI} (mode: ${APPLY ? 'APPLY' : 'DRY RUN'})\n`);

  const zones = await db.collection('zones').find({ isActive: true }).toArray();
  const centrales = await db.collection('centrales').find().toArray();
  const nros = await db.collection('nros').find().toArray();
  const fdts = await db.collection('fdts').find().toArray();
  const contracts = await db.collection('contracts').find().toArray();

  const usedCodes = new Set<string>(centrales.map((c: Doc) => c.code));
  const centraleByZoneId = new Map<string, Doc>(centrales.map((c: Doc) => [c.regionId.toString(), c]));

  const newCentrales: Doc[] = [];
  const reassignedCentraleReport: string[] = [];

  for (const zone of zones) {
    const zoneId = zone._id.toString();
    if (centraleByZoneId.has(zoneId)) continue; // already has its own Centrale (the 6 hubs)

    const zoneNros = nros.filter((n: Doc) => n.regionId === zoneId);
    if (zoneNros.length === 0) continue; // no infrastructure here, no Centrale needed

    const avgLng = zoneNros.reduce((s: number, n: Doc) => s + n.location.coordinates[0], 0) / zoneNros.length;
    const avgLat = zoneNros.reduce((s: number, n: Doc) => s + n.location.coordinates[1], 0) / zoneNros.length;

    const newCentrale: Doc = {
      _id: new ObjectId(),
      nom: `Centrale ${zone.name}`,
      code: centraleCode(zone.name, usedCodes),
      ville: zone.name,
      regionId: zone._id,
      position: { type: 'Point', coordinates: [Math.round(avgLng * 1e6) / 1e6, Math.round(avgLat * 1e6) / 1e6] },
      capaciteTotal: 0, // computed below
      oltIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    newCentrales.push(newCentrale);
    centraleByZoneId.set(zoneId, newCentrale);
  }

  // Reassign every NRO to its OWN zone's Centrale (was: the shared hub Centrale).
  const nroUpdates: Array<{ nroId: string; oldCentraleId: string; newCentraleId: string }> = [];
  for (const nro of nros) {
    const targetCentrale = centraleByZoneId.get(nro.regionId);
    if (!targetCentrale) continue; // zone has no Centrale at all (shouldn't happen, guarded above)
    const oldCentraleId = nro.centraleId?.toString();
    const newCentraleId = targetCentrale._id.toString();
    if (oldCentraleId !== newCentraleId) {
      nroUpdates.push({ nroId: nro.externalId, oldCentraleId, newCentraleId });
      nro.centraleId = targetCentrale._id; // mutate in-memory copy for capacity recompute below
    }
  }

  // FDT.centraleId and Contract.centraleId are denormalized from their NRO — recompute from the
  // (possibly just-updated) NRO.centraleId so the whole chain stays consistent.
  const nroByExternalId = new Map(nros.map((n: Doc) => [n.externalId, n]));
  const fdtUpdates: Array<{ fdtId: string; newCentraleId: string }> = [];
  for (const fdt of fdts) {
    const nro = nroByExternalId.get(fdt.nroId);
    if (!nro) continue;
    const newCentraleId = nro.centraleId.toString();
    if (fdt.centraleId?.toString() !== newCentraleId) {
      fdtUpdates.push({ fdtId: fdt.externalId, newCentraleId });
      fdt.centraleId = nro.centraleId;
    }
  }

  const fdtByExternalId = new Map(fdts.map((f: Doc) => [f.externalId, f]));
  const contractUpdates: Array<{ contractId: string; newCentraleId: string }> = [];
  for (const contract of contracts) {
    const fdt = fdtByExternalId.get(contract.fdtId);
    if (!fdt) continue;
    const newCentraleId = fdt.centraleId.toString();
    if (contract.centraleId?.toString() !== newCentraleId) {
      contractUpdates.push({ contractId: contract.externalId, newCentraleId });
    }
  }

  // Recompute capaciteTotal for every Centrale (old 6 + new 18) from its now-correct NRO set.
  const allCentrales = [...centrales, ...newCentrales];
  const capacityUpdates: Array<{ centraleId: string; capaciteTotal: number }> = [];
  for (const centrale of allCentrales) {
    const owned = nros.filter((n: Doc) => n.centraleId.toString() === centrale._id.toString());
    const capaciteTotal = Math.round(owned.reduce((sum: number, n: Doc) => sum + n.maxCapacity, 0) * 1.15);
    capacityUpdates.push({ centraleId: centrale._id.toString(), capaciteTotal });
  }

  console.log('=== SUMMARY ===');
  console.log(`Existing Centrales: ${centrales.length}`);
  console.log(`New Centrales to create: ${newCentrales.length} (${newCentrales.map((c) => c.nom).join(', ')})`);
  console.log(`Total Centrales after: ${allCentrales.length}`);
  console.log(`NRO reassignments: ${nroUpdates.length} / ${nros.length}`);
  console.log(`FDT centraleId updates: ${fdtUpdates.length} / ${fdts.length}`);
  console.log(`Contract centraleId updates: ${contractUpdates.length} / ${contracts.length}`);

  const zonesStillEmpty = zones.filter((z: Doc) => {
    const zid = z._id.toString();
    return !centraleByZoneId.has(zid);
  });
  console.log(`Zones with no infrastructure (expected to stay without a Centrale): ${zonesStillEmpty.length} ${zonesStillEmpty.map((z: Doc) => z.name)}`);

  if (!APPLY) {
    console.log('\nDRY RUN complete — no data was written. Re-run with --apply to write these changes.');
    await client.close();
    return;
  }

  console.log('\n=== APPLYING ===');

  if (newCentrales.length) {
    await db.collection('centrales').insertMany(newCentrales.map(({ _id, ...rest }) => ({ _id, ...rest })));
    console.log(`Inserted ${newCentrales.length} new Centrale(s).`);
  }

  for (const update of nroUpdates) {
    await db.collection('nros').updateOne(
      { externalId: update.nroId },
      { $set: { centraleId: new ObjectId(update.newCentraleId) } },
    );
  }
  console.log(`Reassigned ${nroUpdates.length} NRO(s).`);

  for (const update of fdtUpdates) {
    await db.collection('fdts').updateOne(
      { externalId: update.fdtId },
      { $set: { centraleId: new ObjectId(update.newCentraleId) } },
    );
  }
  console.log(`Updated ${fdtUpdates.length} FDT(s).`);

  for (const update of contractUpdates) {
    await db.collection('contracts').updateOne(
      { externalId: update.contractId },
      { $set: { centraleId: new ObjectId(update.newCentraleId) } },
    );
  }
  console.log(`Updated ${contractUpdates.length} Contract(s).`);

  for (const update of capacityUpdates) {
    await db.collection('centrales').updateOne(
      { _id: new ObjectId(update.centraleId) },
      { $set: { capaciteTotal: update.capaciteTotal } },
    );
  }
  console.log(`Recomputed capaciteTotal for ${capacityUpdates.length} Centrale(s).`);

  await client.close();
  console.log('\nDone. Re-run scripts/migration/04-backfill-reclamation-links.ts next (Contract.centraleId changed).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
