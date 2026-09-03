/**
 * SCRIPT DE MIGRATION SÉCURISÉE DES EMAILS UTILISATEURS
 *
 * Règles :
 * - Uniquement mise à jour de user.email via $set.
 * - Ne touche jamais aux mots de passe, hashes, rôles, zoneId, isActive.
 * - Validation stricte du format email, normalisation (trim + lowercase), et unicité.
 * - En cas de collision ou d'email invalide : STOP immédiat sans écriture.
 */

import { MongoClient } from 'mongodb';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart_fiber';

/**
 * 📝 CORRESPONDANCES EXPLICITES USERNAME -> EMAIL
 * Renseigner ici les adresses email réelles pour chaque compte.
 */
export const USERNAME_TO_EMAIL_MAP: Record<string, string> = {
  admin: 'admin@smartfiber.tn',
  // Décommentez et complétez les emails souhaités ci-dessous :
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

export async function migrateUserEmails(isDryRun = true) {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db();
  const usersCollection = db.collection('users');

  console.log(`\n🔍 [MIGRATION] Mode: ${isDryRun ? 'DRY-RUN (Simulation sans écriture)' : 'EXÉCUTION RÉELLE'}`);
  console.log('--------------------------------------------------');

  const allUsers = await usersCollection.find({}).toArray();
  const seenEmails = new Set<string>();

  // 1. Enregistrer tous les emails existants dans la DB
  for (const u of allUsers) {
    if (u.email && typeof u.email === 'string' && u.email.trim().length > 0) {
      seenEmails.add(u.email.trim().toLowerCase());
    }
  }

  const updatesToApply: Array<{
    userId: any;
    username: string;
    role: string;
    currentEmail?: string;
    newEmail: string;
  }> = [];

  // 2. Valider les correspondances
  for (const [username, rawEmail] of Object.entries(USERNAME_TO_EMAIL_MAP)) {
    if (!rawEmail || typeof rawEmail !== 'string') continue;

    const normalizedEmail = rawEmail.trim().toLowerCase();

    // Validation du format
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      throw new Error(`❌ Format email invalide pour username "${username}": "${rawEmail}"`);
    }

    // Trouver l'utilisateur
    const user = allUsers.find((u) => u.username?.toLowerCase() === username.toLowerCase());
    if (!user) {
      console.warn(`⚠️ Utilisateur "${username}" introuvable en base, ignoré.`);
      continue;
    }

    // Vérifier l'unicité
    if (seenEmails.has(normalizedEmail) && user.email?.trim().toLowerCase() !== normalizedEmail) {
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
    console.log('\n⚠️ Simulation terminée. Aucune donnée n\'a été modifiée en base.');
    await client.close();
    return;
  }

  // 3. Application des mises à jour atomiques ($set: { email })
  console.log('\n🚀 Application des modifications...');
  for (const item of updatesToApply) {
    const result = await usersCollection.updateOne(
      { _id: item.userId },
      { $set: { email: item.newEmail } },
    );
    if (result.modifiedCount > 0) {
      console.log(`   ✅ "${item.username}" mis à jour avec succès.`);
    } else {
      console.log(`   ℹ️ "${item.username}" déjà à jour.`);
    }
  }

  console.log('\n✨ Migration terminée avec succès.');
  await client.close();
}

if (require.main === module) {
  // Par défaut, exécuter en DRY RUN
  const args = process.argv.slice(2);
  const isExecute = args.includes('--execute');
  migrateUserEmails(!isExecute).catch((err) => {
    console.error('❌ Erreur de migration :', err.message);
    process.exit(1);
  });
}
