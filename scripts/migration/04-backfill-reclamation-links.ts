/**
 * Backfills Reclamation.nroId (fixing the wrong _id-vs-externalId format) and populates the
 * newly added Reclamation.fdtId/centraleId from each reclamation's linked Contract, which
 * already carries the full FTTH chain denormalized. Safe to re-run (idempotent).
 */
import { MongoClient, ObjectId } from 'mongodb';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart_fiber';

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db();

  const reclamations = await db.collection('reclamations').find({ contractId: { $exists: true, $ne: null } }).toArray();
  console.log(`Found ${reclamations.length} reclamation(s) with a contractId to backfill.`);

  let updated = 0;
  let skippedNoContract = 0;

  for (const reclamation of reclamations) {
    let contract = null;
    try {
      contract = await db.collection('contracts').findOne({ _id: new ObjectId(reclamation.contractId) });
    } catch {
      // contractId wasn't a valid ObjectId string — leave this reclamation alone.
    }

    if (!contract) {
      skippedNoContract += 1;
      continue;
    }

    await db.collection('reclamations').updateOne(
      { _id: reclamation._id },
      {
        $set: {
          nroId: contract.nroId ?? reclamation.nroId,
          fdtId: contract.fdtId,
          centraleId: contract.centraleId,
        },
      },
    );
    updated += 1;
  }

  console.log(`Updated: ${updated}, skipped (no matching contract): ${skippedNoContract}`);
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
