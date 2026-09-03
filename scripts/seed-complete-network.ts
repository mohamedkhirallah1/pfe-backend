import { MongoClient, ObjectId } from 'mongodb';
import { TUNISIA_REGION_CENTERS } from '../src/modules/zones/constants/tunisia-region-centers.constant';
import { TunisiaRegion } from '../src/modules/users/constants/tunisia-regions.constant';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart_fiber';

// Mulberry32 deterministic PRNG
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

const rng = mulberry32(20260819);
const randFloat = (min: number, max: number) => min + rng() * (max - min);
const randInt = (min: number, max: number) => Math.floor(randFloat(min, max + 1));
const pick = <T>(arr: readonly T[]): T => arr[randInt(0, arr.length - 1)];

const usedCoordKeys = new Set<string>();

function jitterAround(center: { lat: number; lng: number }, minKm: number, maxKm: number): [number, number] {
  for (let attempt = 0; attempt < 50; attempt++) {
    const radiusKm = randFloat(minKm, maxKm);
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
  return [center.lng + randFloat(0.001, 0.01), center.lat + randFloat(0.001, 0.01)];
}

const FIRST_NAMES = [
  'Mohamed', 'Ahmed', 'Youssef', 'Ali', 'Omar', 'Karim', 'Sami', 'Hamza', 'Bilel', 'Anis',
  'Fatma', 'Mariem', 'Sarra', 'Yasmine', 'Ines', 'Nour', 'Amira', 'Rania', 'Salma', 'Hela'
];

const LAST_NAMES = [
  'Trabelsi', 'Gharbi', 'Ben Ali', 'Bouazizi', 'Masmoudi', 'Hammami', 'Mejri', 'Ayari', 'Dridi', 'Jlassi',
  'Khemiri', 'Mansouri', 'Zaidi', 'Baccouche', 'Chérif', 'Mahjoub', 'Rekik', 'Sassi', 'Fourati', 'Ben Amor'
];

const STREET_NAMES = [
  'Avenue Habib Bourguiba', 'Rue de la République', 'Avenue Mohamed V', 'Rue de Palestine',
  'Avenue de la Liberté', 'Rue Ibn Khaldoun', 'Avenue de Carthage', 'Rue Taieb Mhiri',
  'Rue Farhat Hached', 'Avenue 14 Janvier', 'Rue de la Gare', 'Avenue Ali Balhouane'
];

let phoneCounter = 100000;
const PHONE_PREFIXES = ['20', '21', '22', '24', '25', '26', '27', '28', '29', '50', '52', '53', '54', '55', '56', '58', '90', '92', '93', '94', '95', '96', '97', '98'];

function generatePhoneNumber(): string {
  phoneCounter++;
  const prefix = pick(PHONE_PREFIXES);
  const suffix = String(phoneCounter).slice(-6).padStart(6, '0');
  return `${prefix}${suffix}`;
}

let cinCounter = 10000000;
function generateCin(): string {
  cinCounter++;
  return String(cinCounter);
}

function centraleCode(zoneName: string): string {
  const clean = zoneName.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  return `CO-${clean}-01`;
}

type Doc = Record<string, any>;

async function main() {
  console.log(`Connecting to ${MONGO_URI}...`);
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db();
  console.log('Connected to MongoDB.\n');

  // 1. Fetch Zones
  const zones = await db.collection('zones').find({ isActive: true }).toArray();
  if (zones.length === 0) {
    console.error('Error: No zones found in the database. Make sure the backend has run at least once to seed zones.');
    await client.close();
    process.exit(1);
  }

  console.log(`Found ${zones.length} active zones in the database.`);

  const zoneMap = new Map<string, Doc>();
  for (const z of zones) {
    zoneMap.set(z.name, z);
  }

  const centralesToInsert: Doc[] = [];
  const nrosToInsert: Doc[] = [];
  const fdtsToInsert: Doc[] = [];
  const contractsToInsert: Doc[] = [];
  const reclamationsToInsert: Doc[] = [];

  let contractSeq = 10000;
  let recSeq = 1000;

  const NRO_CAPACITIES = [400, 500, 600, 800, 1000];
  const FDT_PORTS = [64, 128, 256];
  const BANDWIDTH_TIERS = [20, 50, 100, 300, 1000];
  const CLIENT_TYPES = ['MAISON', 'ENTREPRISE', 'IMMEUBLE'];

  // 2. Build complete hierarchy per Zone
  for (const zone of zones) {
    const zoneName = zone.name as TunisiaRegion;
    const center = TUNISIA_REGION_CENTERS[zoneName] || {
      lat: (zone.polygon?.coordinates?.[0]?.[0]?.[1] ?? 36.8),
      lng: (zone.polygon?.coordinates?.[0]?.[0]?.[0] ?? 10.1),
    };

    const centraleId = new ObjectId();
    const centralePos: [number, number] = [center.lng, center.lat];

    // A. 1 Centrale per Zone
    const centrale: Doc = {
      _id: centraleId,
      nom: `Centrale ${zone.name}`,
      code: centraleCode(zone.name),
      ville: zone.name,
      regionId: zone._id,
      position: { type: 'Point', coordinates: centralePos },
      capaciteTotal: 0, // Computed after NROs
      oltIds: [`OLT-${zone.name.toUpperCase().slice(0, 3)}-01`, `OLT-${zone.name.toUpperCase().slice(0, 3)}-02`],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // B. 2 to 3 NROs per Zone
    const isMajorZone = ['Tunis', 'Sfax', 'Sousse', 'Ariana', 'Ben Arous'].includes(zone.name);
    const nroCount = isMajorZone ? 3 : 2;
    const nroPositionsLabels = ['Centre', 'Nord', 'Sud', 'Est'];

    let zoneTotalCapacity = 0;

    for (let nIdx = 0; nIdx < nroCount; nIdx++) {
      const nroId = new ObjectId();
      const nroCode = `NRO-${zone.name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3)}-${String(nIdx + 1).padStart(2, '0')}`;
      const nroPos = jitterAround(center, 1.0, 4.5);
      const nroCenter = { lat: nroPos[1], lng: nroPos[0] };
      const maxCapacity = pick(NRO_CAPACITIES);
      zoneTotalCapacity += maxCapacity;

      const nroDoc: Doc = {
        _id: nroId,
        externalId: nroCode,
        name: `NRO ${zone.name} ${nroPositionsLabels[nIdx]}`,
        regionId: zone._id.toString(),
        centraleId: centraleId,
        location: { type: 'Point', coordinates: nroPos },
        maxCapacity: maxCapacity,
        currentLoad: 0, // Computed from contracts
        capacityGb: maxCapacity,
        capaciteUtilisee: 0,
        usedGb: 0,
        performanceScore: randInt(88, 99),
        status: 'ACTIVE',
        statutSaturation: 'NORMAL',
        tauxSaturation: 0,
        connectedFdtsCount: 0,
        lastEventType: 'SEED',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // C. 2 to 3 FDTs per NRO
      const fdtCount = isMajorZone ? 3 : 2;
      let nroLoad = 0;

      for (let fIdx = 0; fIdx < fdtCount; fIdx++) {
        const fdtId = new ObjectId();
        const fdtCode = `FDT-${zone.name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3)}-${nIdx + 1}${fIdx + 1}`;
        const fdtPos = jitterAround(nroCenter, 0.3, 1.8);
        const fdtCenter = { lat: fdtPos[1], lng: fdtPos[0] };
        const nbPorts = pick(FDT_PORTS);

        const fdtDoc: Doc = {
          _id: fdtId,
          externalId: fdtCode,
          nroId: nroCode,
          centraleId: centraleId,
          regionId: zone._id.toString(),
          location: { type: 'Point', coordinates: fdtPos },
          maxClients: nbPorts,
          activeClients: 0, // Computed from contracts
          signalQuality: randInt(85, 98),
          status: 'ACTIVE',
          nbPortsTotal: nbPorts,
          nbPortsUtilises: 0,
          statutFdt: 'DISPONIBLE',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        // D. 4 to 8 Contracts per FDT
        const contractsCount = randInt(4, 8);
        let fdtActiveClients = 0;

        for (let cIdx = 0; cIdx < contractsCount; cIdx++) {
          contractSeq++;
          const contractId = new ObjectId();
          const contractCode = `EXT-${contractSeq}`;
          const contractPos = jitterAround(fdtCenter, 0.05, 0.6);
          const bandwidth = pick(BANDWIDTH_TIERS);
          const clientType = pick(CLIENT_TYPES);
          const firstName = pick(FIRST_NAMES);
          const lastName = pick(LAST_NAMES);
          const street = pick(STREET_NAMES);
          const streetNum = randInt(1, 150);

          fdtActiveClients++;
          nroLoad += Math.round(bandwidth * 0.1); // Statistical concentration

          const contractDoc: Doc = {
            _id: contractId,
            externalId: contractCode,
            location: { type: 'Point', coordinates: contractPos },
            numeroTelephone: generatePhoneNumber(),
            numeroCIN: generateCin(),
            phoneNumber: generatePhoneNumber(),
            cin: generateCin(),
            status: 'ACTIVE',
            latitude: contractPos[1],
            longitude: contractPos[0],
            bandwidth: bandwidth,
            offreGB: bandwidth,
            packageGb: bandwidth,
            typeClient: clientType,
            installationStatus: 'COMPLETED',
            zoneId: zone._id.toString(),
            regionId: zone._id.toString(),
            nroId: nroCode,
            fdtId: fdtCode,
            centraleId: centraleId,
            traceFDT: {
              type: 'LineString',
              coordinates: [fdtPos, contractPos],
            },
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          contractsToInsert.push(contractDoc);

          // E. Some realistic Reclamations (~15% of contracts)
          if (rng() < 0.15) {
            recSeq++;
            const recType = pick(['FAIBLE_DEBIT', 'COUPURE', 'REINITIALISATION']);
            const recPriority = recType === 'COUPURE' ? 'HIGH' : 'MEDIUM';
            const recStatus = pick(['NEW', 'IN_PROGRESS', 'RESOLVED']);

            const reclamationDoc: Doc = {
              _id: new ObjectId(),
              externalId: `REC-2026-${recSeq}`,
              phoneNumber: contractDoc.phoneNumber,
              numeroCIN: contractDoc.numeroCIN,
              cin: contractDoc.cin,
              description: `Problème de ${recType.toLowerCase()} signalé par ${firstName} ${lastName} au ${streetNum} ${street}, ${zone.name}`,
              typeReclamation: recType,
              status: recStatus,
              latitude: contractPos[1],
              longitude: contractPos[0],
              zoneId: zone._id.toString(),
              regionId: zone._id.toString(),
              nroId: nroCode,
              fdtId: fdtCode,
              centraleId: centraleId,
              contractId: contractCode,
              category: recType === 'COUPURE' ? 'coupure' : 'panne',
              priority: recPriority,
              recommendation: recType === 'COUPURE' ? 'Vérifier la continuité du brin optique FDT' : 'Contrôler la puissance du signal optique au terminal abonné',
              urgence: recType === 'COUPURE',
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            reclamationsToInsert.push(reclamationDoc);
          }
        }

        fdtDoc.activeClients = fdtActiveClients;
        fdtDoc.nbPortsUtilises = fdtActiveClients;
        fdtDoc.statutFdt = fdtActiveClients >= nbPorts * 0.9 ? 'PLEIN' : fdtActiveClients >= nbPorts * 0.7 ? 'CHARGE' : 'DISPONIBLE';
        fdtsToInsert.push(fdtDoc);
      }

      nroDoc.connectedFdtsCount = fdtCount;
      nroDoc.currentLoad = Math.min(nroDoc.maxCapacity, nroLoad + randInt(50, 150));
      nroDoc.capaciteUtilisee = nroDoc.currentLoad;
      nroDoc.usedGb = nroDoc.currentLoad;
      nroDoc.tauxSaturation = Math.round((nroDoc.currentLoad / nroDoc.maxCapacity) * 100);
      nroDoc.statutSaturation = nroDoc.tauxSaturation >= 90 ? 'SATURE' : nroDoc.tauxSaturation >= 70 ? 'CHARGE' : 'NORMAL';
      if (nroDoc.tauxSaturation >= 95) {
        nroDoc.status = 'SATURATED';
      }

      nrosToInsert.push(nroDoc);
    }

    centrale.capaciteTotal = zoneTotalCapacity;
    centralesToInsert.push(centrale);
  }

  console.log(`\n================ GENERATION SUMMARY ================`);
  console.log(`Centrales to insert:    ${centralesToInsert.length} (Exactly 1 per zone)`);
  console.log(`NROs to insert:         ${nrosToInsert.length}`);
  console.log(`FDTs to insert:         ${fdtsToInsert.length}`);
  console.log(`Contracts to insert:    ${contractsToInsert.length}`);
  console.log(`Reclamations to insert: ${reclamationsToInsert.length}`);
  console.log(`====================================================\n`);

  console.log('Cleaning old operational data (centrales, nros, fdts, contracts, reclamations)...');
  await db.collection('centrales').deleteMany({});
  await db.collection('nros').deleteMany({});
  await db.collection('fdts').deleteMany({});
  await db.collection('contracts').deleteMany({});
  await db.collection('reclamations').deleteMany({});

  console.log('Inserting new dataset...');
  if (centralesToInsert.length > 0) await db.collection('centrales').insertMany(centralesToInsert);
  if (nrosToInsert.length > 0) await db.collection('nros').insertMany(nrosToInsert);
  if (fdtsToInsert.length > 0) await db.collection('fdts').insertMany(fdtsToInsert);
  if (contractsToInsert.length > 0) await db.collection('contracts').insertMany(contractsToInsert);
  if (reclamationsToInsert.length > 0) await db.collection('reclamations').insertMany(reclamationsToInsert);

  console.log('\nCreating 2dsphere spatial indexes...');
  await db.collection('centrales').createIndex({ position: '2dsphere' });
  await db.collection('nros').createIndex({ location: '2dsphere' });
  await db.collection('fdts').createIndex({ location: '2dsphere' });
  await db.collection('contracts').createIndex({ location: '2dsphere' });

  console.log('Seed completed successfully! All 24 zones now have a complete Centrale -> NRO -> FDT -> Contract hierarchy.');
  await client.close();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
