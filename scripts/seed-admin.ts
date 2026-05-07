import mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart_fiber';

async function seed() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const userSchema = new mongoose.Schema({
      username: { type: String, required: true, unique: true },
      password: { type: String, required: true },
      role: { type: String, required: true, enum: ['ADMIN', 'RESPONSABLE_ZONE'] },
      zoneId: { type: String, required: false },
      isActive: { type: Boolean, default: true },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    });

    const User = mongoose.model('User', userSchema, 'users');

    // Vérifier si l'admin existe déjà
    const existingAdmin = await User.findOne({ username: 'admin' });
    if (existingAdmin) {
      console.log('Admin user already exists');
      await mongoose.disconnect();
      return;
    }

    // Créer l'admin par défaut
    const hashedPassword = await bcrypt.hash('admin1234', 10);
    const admin = new User({
      username: 'admin',
      password: hashedPassword,
      role: 'ADMIN',
      isActive: true,
    });

    await admin.save();
    console.log('✅ Admin user created: username=admin, password=admin1234');

    // Créer 24 zones managers pour la Tunisie (Régions)
    const tunisianRegions = [
      'Tunis',
      'Ariana',
      'Ben Arous',
      'Manouba',
      'Nabeul',
      'Zaghouan',
      'Sousse',
      'Monastir',
      'Mahdia',
      'Sfax',
      'Gafsa',
      'Tozeur',
      'Kebili',
      'Tataouine',
      'Médenine',
      'Gabès',
      'Djerba',
      'Kasserine',
      'Sidi Bouzid',
      'Kairouan',
      'Bizerte',
      'Jendouba',
      'Siliana',
      'Le Kef',
    ];

    for (let i = 0; i < tunisianRegions.length; i++) {
      const region = tunisianRegions[i];
      const username = `zone_${region.toLowerCase().replace(/\s+/g, '_')}`;

      // Vérifier si le responsable existe déjà
      const existing = await User.findOne({ username });
      if (!existing) {
        const hashedPwd = await bcrypt.hash('zone1234', 10);
        const zoneManager = new User({
          username,
          password: hashedPwd,
          role: 'RESPONSABLE_ZONE',
          zoneId: region,
          isActive: true,
        });

        await zoneManager.save();
        console.log(
          `✅ Zone manager created: ${username} for region "${region}"`,
        );
      }
    }

    console.log('\n✅ Seeding completed successfully!');
    console.log('\nAdmins can now create additional zone managers via:');
    console.log('POST /users/zone-managers');
    console.log('Body: { "username": "...", "password": "...", "zoneId": "..." }');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

seed();
