/**
 * SCRIPT DE MIGRATION SÉCURISÉE DES EMAILS UTILISATEURS (JavaScript direct)
 */
const { MongoClient } = require('c:/Users/Asus/smart-fiber-backendd/node_modules/mongodb');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart_fiber';

/**
 * 📝 CORRESPONDANCES EXPLICITES USERNAME -> EMAIL
 * Complétez ici avec les vraies adresses avant d'exécuter.
 */
const USERNAME_TO_EMAIL_MAP = {
  admin: 'admin@smartfiber.tn',
  // khirallah: 'khirallah@smartfiber.tn',
  // mesba7: 'mesba7@smartfiber.tn',
  // yass: 'yass@smartfiber.tn',
  // yosr: 'yosr@smartfiber.tn',
  // aloulou: 'aloulou@smartfiber.tn',
  // zouhair: 'zouhair@smartfiber.tn',
  // ons: 'ons@smartfiber.tn',
  // khikhou: 'khikhou@smartfiber.tn',
  // boza: 'boza@smartfiber.tn',
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function migrateUserEmails(isDryRun = true) {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db();
  const usersCollection = db.collection('users');

  console.log(`\n🔍 [MIGRATION] Mode: ${isDryRun ? 'DRY-RUN (Simulation sans écriture)' : 'EXÉCUTION RÉELLE'}`);
  console.log('--------------------------------------------------');

  const allUsers = await usersCollection.find({}).toArray();
  const seenEmails = new Set();

  for (const u of allUsers) {
    if (u.email && typeof u.email === 'string' && u.email.trim().length > 0) {
      seenEmails.add(u.email.trim().toLowerCase());
    }
  }

  const updatesToApply = [];

  for (const [username, rawEmail] of Object.entries(USERNAME_TO_EMAIL_MAP)) {
    if (!rawEmail || typeof rawEmail !== 'string') continue;

    const normalizedEmail = rawEmail.trim().toLowerCase();

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      throw new Error(`❌ Format email invalide pour username "${username}": "${rawEmail}"`);
    }

    const user = allUsers.find((u) => u.username && u.username.toLowerCase() === username.toLowerCase());
    if (!user) {
      console.warn(`⚠️ Utilisateur "${username}" introuvable en base, ignoré.`);
      continue;
    }

    if (seenEmails.has(normalizedEmail) && user.email && user.email.trim().toLowerCase() !== normalizedEmail) {
      throw new Error(`❌ Collision d'email détectée : "${normalizedEmail}" est déjà utilisé par un autre utilisateur ! STOP.`);
    }

    seenEmails.add(normalizedEmail);
    updatesToApply.push({
      userId: user._id,
      username: user.username,
      role: user.role,
      currentEmail: user.email,
      newEmail: normalizedEmail,
    });
  }

  console.log(`📋 ${updatesToApply.length} mise(s) à jour validée(s) :`);
  for (const item of updatesToApply) {
    console.log(`   - [${item.role}] "${item.username}" : "${item.currentEmail ?? 'undefined'}" -> "${item.newEmail}"`);
  }

  if (isDryRun) {
    console.log('\n⚠️ Mode simulation terminé. Aucune donnée n\'a été modifiée en base.');
    await client.close();
    return;
  }

  console.log('\n🚀 Application des modifications atomiques ($set: { email })...');
  for (const item of updatesToApply) {
    const result = await usersCollection.updateOne(
      { _id: item.userId },
      { $set: { email: item.newEmail } },
    );
    if (result.modifiedCount > 0) {
      console.log(`   ✅ "${item.username}" mis à jour avec l'email "${item.newEmail}".`);
    } else {
      console.log(`   ℹ️ "${item.username}" était déjà à jour.`);
    }
  }

  console.log('\n✨ Migration terminée avec succès.');
  await client.close();
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const isExecute = args.includes('--execute');
  migrateUserEmails(!isExecute).catch((err) => {
    console.error('❌ Erreur de migration :', err.message);
    process.exit(1);
  });
}

module.exports = { migrateUserEmails, USERNAME_TO_EMAIL_MAP };
