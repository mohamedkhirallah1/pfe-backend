import mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart_fiber';

async function seed() {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const userSchema = new mongoose.Schema({
      username: { type: String, required: true, unique: true, trim: true },
      email: { type: String, required: false, unique: true, sparse: true, lowercase: true, trim: true },
      password: { type: String, required: true },
      role: { type: String, required: true, enum: ['ADMIN', 'RESPONSABLE_ZONE', 'SERVICE_CLIENT'] },
      zoneId: { type: String, required: false },
      isActive: { type: Boolean, default: true },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    });

    const User = mongoose.model('User', userSchema, 'users');

    // Vérifier si l'admin existe déjà
    const existingAdmin = await User.findOne({ username: 'admin' });
    if (!existingAdmin) {
      // Créer l'admin par défaut
      const hashedPassword = await bcrypt.hash('admin1234', 10);
      const admin = new User({
        username: 'admin',
        email: 'admin@smartfiber.tn',
        password: hashedPassword,
        role: 'ADMIN',
        isActive: true,
      });

      await admin.save();
      console.log('✅ Admin user created: username=admin, email=admin@smartfiber.tn, password=admin1234');
    } else if (!existingAdmin.email) {
      existingAdmin.email = 'admin@smartfiber.tn';
      await existingAdmin.save();
      console.log('✅ Existing admin updated with email: admin@smartfiber.tn');
    }

    // Vérifier si le Service Client existe déjà
    const existingServiceClient = await User.findOne({
      $or: [{ username: 'service_client' }, { email: 'serviceclient@smartfiber.tn' }],
    });
    if (!existingServiceClient) {
      const hashedServiceClientPwd = await bcrypt.hash('service1234', 10);
      const serviceClientUser = new User({
        username: 'service_client',
        email: 'serviceclient@smartfiber.tn',
        password: hashedServiceClientPwd,
        role: 'SERVICE_CLIENT',
        isActive: true,
      });
      await serviceClientUser.save();
      console.log('✅ Service Client user created: username=service_client, email=serviceclient@smartfiber.tn, password=service1234');
    } else {
      let updated = false;
      if (!existingServiceClient.email) {
        existingServiceClient.email = 'serviceclient@smartfiber.tn';
        updated = true;
      }
      if (existingServiceClient.role !== 'SERVICE_CLIENT') {
        existingServiceClient.role = 'SERVICE_CLIENT';
        updated = true;
      }
      if (updated) {
        await existingServiceClient.save();
        console.log('✅ Existing service client updated: serviceclient@smartfiber.tn (SERVICE_CLIENT)');
      }
    }

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
      const regionSlug = region
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_');
      const username = `zone_${regionSlug}`;
      const email = `zone_${regionSlug}@smartfiber.tn`;

      // Vérifier si le responsable existe déjà
      const existing = await User.findOne({ username });
      if (!existing) {
        const hashedPwd = await bcrypt.hash('zone1234', 10);
        const zoneManager = new User({
          username,
          email,
          password: hashedPwd,
          role: 'RESPONSABLE_ZONE',
          zoneId: region,
          isActive: true,
        });

        await zoneManager.save();
        console.log(
          `✅ Zone manager created: ${username} (${email}) for region "${region}"`,
        );
      } else if (!existing.email) {
        existing.email = email;
        await existing.save();
        console.log(
          `✅ Existing zone manager updated with email: ${email}`,
        );
      }
    }

    console.log('\n✅ Seeding completed successfully!');
    console.log('\nAdmins can create additional zone managers via:');
    console.log('POST /api/users/zone-managers');
    console.log('Body: { "username": "...", "email": "...", "password": "...", "zoneId": "..." }');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

seed();
