/**
 * Step 3: full JSON backup of every collection touched by the migration, taken BEFORE any
 * write happens. Run this and confirm the printed file sizes/counts before ever running
 * 03-generate-seed.ts. Idempotent/safe to re-run — each run gets its own timestamped folder.
 */
import { MongoClient } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart_fiber';

// Zones and users are never touched by this migration, so they're not in scope for backup.
const COLLECTIONS_TO_BACKUP = [
  'centrales',
  'nros',
  'fdts',
  'contracts',
  'reclamations',
  'notifications',
  'central_fibers',
  'ai_recommendations',
  'ai_alerts',
  'ai_executive_reports',
  'ai_network_snapshots',
];

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, '..', '..', 'backups', timestamp);
  fs.mkdirSync(backupDir, { recursive: true });

  console.log(`Backing up to: ${backupDir}\n`);

  const manifest: Record<string, number> = {};

  for (const name of COLLECTIONS_TO_BACKUP) {
    const docs = await db.collection(name).find().toArray();
    const filePath = path.join(backupDir, `${name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf-8');
    manifest[name] = docs.length;
    console.log(`  ${name.padEnd(25)} ${docs.length} document(s) -> ${path.basename(filePath)}`);
  }

  fs.writeFileSync(
    path.join(backupDir, '_manifest.json'),
    JSON.stringify({ createdAt: new Date().toISOString(), mongoUri: MONGO_URI, counts: manifest }, null, 2),
    'utf-8',
  );

  await client.close();
  console.log(`\nBackup complete: ${backupDir}`);
  console.log('Keep this folder until the new dataset has been verified in the running application.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
