import { MongoClient, ObjectId } from 'mongodb';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart_fiber';

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db();
  console.log('Connected to MongoDB.\n');

  const zones = await db.collection('zones').find({ isActive: true }).toArray();
  const nros = await db.collection('nros').find().toArray();
  const fdts = await db.collection('fdts').find().toArray();

  console.log(`Injecting 7-day snapshot history across ${zones.length} zones, ${nros.length} NROs, ${fdts.length} FDTs...`);

  // Clear existing snapshots to insert a rich temporal history
  await db.collection('ai_network_snapshots').deleteMany({});
  await db.collection('ai_anomaly_results').deleteMany({});

  const now = Date.now();
  const HOUR = 60 * 60 * 1000;
  const TOTAL_HOURS = 7 * 24; // 168 hours

  const snapshots: Array<{
    _id: ObjectId;
    zoneId?: string;
    nroExternalId?: string;
    fdtExternalId?: string;
    metric: string;
    value: number;
    createdAt: Date;
    updatedAt: Date;
  }> = [];

  // Identify target NRO and Zone for the anomaly injection
  const tunisZone = zones.find((z) => z.name === 'Tunis') || zones[0];
  const sfaxZone = zones.find((z) => z.name === 'Sfax') || zones[1];
  const anomalyNro = nros.find((n) => n.regionId === tunisZone._id.toString()) || nros[0];
  const anomalyFdt = fdts.find((f) => f.nroId === anomalyNro.externalId) || fdts[0];

  for (let h = TOTAL_HOURS; h >= 0; h--) {
    const timestamp = new Date(now - h * HOUR);
    const isRecent = h <= 12; // Last 12 hours = anomaly window

    // 1. NRO Snapshots
    for (const nro of nros) {
      let saturation = nro.tauxSaturation || 45;
      if (nro.externalId === anomalyNro.externalId) {
        // Normal baseline for 6.5 days, then sudden spike in the last 12 hours
        saturation = isRecent ? 96 + Math.sin(h) * 2 : 42 + Math.sin(h * 0.1) * 3;
      } else {
        saturation = Math.max(15, Math.min(85, saturation + Math.sin(h * 0.2) * 4));
      }

      snapshots.push({
        _id: new ObjectId(),
        zoneId: nro.regionId,
        nroExternalId: nro.externalId,
        metric: 'nroSaturationPct',
        value: Math.round(saturation * 10) / 10,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    // 2. FDT Snapshots
    for (const fdt of fdts) {
      let occupation = (fdt.nbPortsTotal > 0 ? (fdt.nbPortsUtilises / fdt.nbPortsTotal) * 100 : 25);
      if (fdt.externalId === anomalyFdt.externalId) {
        occupation = isRecent ? 92 + Math.sin(h) * 2 : 28 + Math.sin(h * 0.1) * 2;
      } else {
        occupation = Math.max(10, Math.min(80, occupation + Math.sin(h * 0.15) * 3));
      }

      snapshots.push({
        _id: new ObjectId(),
        zoneId: fdt.regionId,
        fdtExternalId: fdt.externalId,
        metric: 'fdtOccupationPct',
        value: Math.round(occupation * 10) / 10,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    // 3. Zone Health Snapshots
    for (const zone of zones) {
      const zoneId = zone._id.toString();
      let health = 92;
      if (zoneId === tunisZone._id.toString() || zoneId === sfaxZone._id.toString()) {
        health = isRecent ? 42 + Math.sin(h) * 3 : 94 + Math.sin(h * 0.1) * 2;
      } else {
        health = Math.max(65, Math.min(98, 90 + Math.sin(h * 0.2) * 5));
      }

      snapshots.push({
        _id: new ObjectId(),
        zoneId: zoneId,
        metric: 'zoneHealthScore',
        value: Math.round(health),
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
  }

  console.log(`Generated ${snapshots.length} historical snapshot data points.`);
  console.log('Inserting into ai_network_snapshots...');
  await db.collection('ai_network_snapshots').insertMany(snapshots);

  console.log('\n======================================================');
  console.log('✅ Scenario injected successfully!');
  console.log(`- Injected NRO Saturation Spike on: ${anomalyNro.externalId} (${anomalyNro.name})`);
  console.log(`- Injected FDT Occupation Spike on: ${anomalyFdt.externalId}`);
  console.log(`- Injected Zone Health Drop on:     ${tunisZone.name} & ${sfaxZone.name}`);
  console.log('======================================================\n');

  await client.close();
}

main().catch(console.error);
