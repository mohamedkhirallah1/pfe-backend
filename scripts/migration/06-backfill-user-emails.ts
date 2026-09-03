/**
 * Migration script: Backfill missing email addresses for existing users and create sparse unique index.
 * Idempotent and safe to run multiple times.
 */
import { MongoClient } from 'mongodb';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart_fiber';

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db();
  const usersCollection = db.collection('users');

  console.log('🔄 Ensuring sparse unique index on email...');
  try {
    await usersCollection.createIndex({ email: 1 }, { unique: true, sparse: true });
    console.log('✅ Sparse unique index on email verified.');
  } catch (error) {
    console.warn('⚠️ Index creation note:', (error as Error).message);
  }

  const users = await usersCollection.find({}).toArray();
  console.log(`📊 Total users found: ${users.length}`);

  let updatedCount = 0;
  let alreadyHasEmailCount = 0;

  for (const user of users) {
    if (user.email && typeof user.email === 'string' && user.email.trim().length > 0) {
      alreadyHasEmailCount++;
      continue;
    }

    const username = user.username || `user_${user._id}`;
    let generatedEmail: string;

    if (user.role === 'ADMIN') {
      generatedEmail = `${username.toLowerCase()}@smartfiber.tn`;
    } else {
      const sanitized = username
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_');
      generatedEmail = `${sanitized}@smartfiber.tn`;
    }

    // Check if generated email already exists to avoid collisions
    const existing = await usersCollection.findOne({ email: generatedEmail });
    if (existing && existing._id.toString() !== user._id.toString()) {
      generatedEmail = `${user._id.toString().slice(-6)}_${generatedEmail}`;
    }

    await usersCollection.updateOne(
      { _id: user._id },
      { $set: { email: generatedEmail } },
    );

    console.log(`  ✓ Updated user "${user.username}" (role: ${user.role}) -> email: ${generatedEmail}`);
    updatedCount++;
  }

  console.log('\n=======================================');
  console.log(`✅ Email Backfill Complete:`);
  console.log(`   - Already had email: ${alreadyHasEmailCount}`);
  console.log(`   - Backfilled:        ${updatedCount}`);
  console.log(`   - Total users:       ${users.length}`);
  console.log('=======================================\n');

  await client.close();
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
