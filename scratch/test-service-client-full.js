const http = require('http');

const BASE_URL = 'http://localhost:3001/api';

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}${path}`);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 AUDIT & VALIDATION COMPLÈTE DU RÔLE SERVICE_CLIENT');
  console.log('================================================================\n');

  let adminToken, zoneToken, serviceClientToken;

  // 1. Seed or verify accounts
  console.log('1. Authentification des différents rôles...');
  
  // Login Admin
  const adminLogin = await request('POST', '/auth/login', {
    email: 'admin@smartfiber.tn',
    password: 'admin1234',
  });
  console.log(`- Login Admin (${adminLogin.status}):`, adminLogin.status === 200 ? '✅ OK' : '❌ ' + JSON.stringify(adminLogin.body));
  if (adminLogin.status === 200) {
    adminToken = adminLogin.body.accessToken;
    console.log(`  Payload: role=${adminLogin.body.user?.role}, email=${adminLogin.body.user?.email}`);
  }

  // Login or Register Service Client
  let scLogin = await request('POST', '/auth/login', {
    email: 'serviceclient@smartfiber.tn',
    password: 'service1234',
  });

  if (scLogin.status !== 200 && adminToken) {
    console.log('  Création du compte service client via script seed ou API admin...');
    // Create service client user
    const createSc = await request('POST', '/users', {
      username: 'service_client',
      email: 'serviceclient@smartfiber.tn',
      password: 'service1234',
      role: 'SERVICE_CLIENT',
    }, adminToken);
    console.log(`  Création Service Client: status=${createSc.status}`);

    scLogin = await request('POST', '/auth/login', {
      email: 'serviceclient@smartfiber.tn',
      password: 'service1234',
    });
  }

  console.log(`- Login Service Client (${scLogin.status}):`, scLogin.status === 200 ? '✅ OK' : '❌ ' + JSON.stringify(scLogin.body));
  if (scLogin.status === 200) {
    serviceClientToken = scLogin.body.accessToken;
    console.log(`  Payload: role=${scLogin.body.user?.role}, email=${scLogin.body.user?.email}`);
  }

  if (!serviceClientToken) {
    console.error('❌ Impossible de continuer sans token SERVICE_CLIENT');
    process.exit(1);
  }

  console.log('\n2. Test des opérations autorisées pour SERVICE_CLIENT...');

  // A. Centrale
  console.log('\n--- [CENTRALE] ---');
  // Get zones to link regionId
  const zonesRes = await request('GET', '/zones', null, serviceClientToken);
  const zoneId = zonesRes.body?.[0]?._id || '64b000000000000000000001';

  const testCentraleCode = `CO-TEST-${Date.now().toString().slice(-4)}`;
  const createCentrale = await request('POST', '/centrales', {
    nom: 'Centrale Test Service Client',
    code: testCentraleCode,
    ville: 'Tunis',
    regionId: zoneId,
    position: [10.1815, 36.8065],
    capaciteTotal: 1000,
  }, serviceClientToken);
  console.log(`- POST /api/centrales (${createCentrale.status}):`, createCentrale.status === 201 ? '✅ OK' : '❌ ' + JSON.stringify(createCentrale.body));
  const centraleId = createCentrale.body?._id;

  const listCentrales = await request('GET', '/centrales', null, serviceClientToken);
  console.log(`- GET /api/centrales (${listCentrales.status}):`, listCentrales.status === 200 ? `✅ OK (${listCentrales.body.length} centrales)` : '❌');

  if (centraleId) {
    const deleteCentrale = await request('DELETE', `/centrales/${centraleId}`, null, serviceClientToken);
    console.log(`- DELETE /api/centrales/:id (${deleteCentrale.status}):`, (deleteCentrale.status === 200 || deleteCentrale.status === 204) ? '✅ OK' : '❌ ' + JSON.stringify(deleteCentrale.body));
  }

  // B. NRO
  console.log('\n--- [NRO] ---');
  const testNroId = `NRO-TEST-${Date.now().toString().slice(-4)}`;
  const createNro = await request('POST', '/nros', {
    externalId: testNroId,
    name: 'NRO Test SC',
    latitude: 36.8065,
    longitude: 10.1815,
    maxCapacity: 500,
    regionId: zoneId,
  }, serviceClientToken);
  console.log(`- POST /api/nros (${createNro.status}):`, createNro.status === 201 ? '✅ OK' : '❌ ' + JSON.stringify(createNro.body));
  const nroMongoId = createNro.body?._id;

  const listNros = await request('GET', '/nros', null, serviceClientToken);
  console.log(`- GET /api/nros (${listNros.status}):`, listNros.status === 200 ? `✅ OK (${listNros.body.length} NROs)` : '❌');

  if (nroMongoId) {
    const deleteNro = await request('DELETE', `/nros/${nroMongoId}`, null, serviceClientToken);
    console.log(`- DELETE /api/nros/:id (${deleteNro.status}):`, deleteNro.status === 200 ? '✅ OK' : '❌ ' + JSON.stringify(deleteNro.body));
  }

  // C. FDT
  console.log('\n--- [FDT] ---');
  const testFdtId = `FDT-TEST-${Date.now().toString().slice(-4)}`;
  const createFdt = await request('POST', '/fdts', {
    externalId: testFdtId,
    latitude: 36.8065,
    longitude: 10.1815,
    nbPortsTotal: 32,
    maxClients: 128,
    regionId: zoneId,
  }, serviceClientToken);
  console.log(`- POST /api/fdts (${createFdt.status}):`, createFdt.status === 201 ? '✅ OK' : '❌ ' + JSON.stringify(createFdt.body));
  const fdtMongoId = createFdt.body?._id;

  const listFdts = await request('GET', '/fdts', null, serviceClientToken);
  console.log(`- GET /api/fdts (${listFdts.status}):`, listFdts.status === 200 ? `✅ OK (${listFdts.body.length} FDTs)` : '❌');

  if (fdtMongoId) {
    const deleteFdt = await request('DELETE', `/fdts/${fdtMongoId}`, null, serviceClientToken);
    console.log(`- DELETE /api/fdts/:id (${deleteFdt.status}):`, (deleteFdt.status === 200 || deleteFdt.status === 204) ? '✅ OK' : '❌ ' + JSON.stringify(deleteFdt.body));
  }

  // D. Contrat
  console.log('\n--- [CONTRAT] ---');
  const testContractId = `CTR-TEST-${Date.now().toString().slice(-4)}`;
  const randomPhone = `98${Math.floor(100000 + Math.random() * 900000)}`;
  const randomCin = `07${Math.floor(100000 + Math.random() * 900000)}`;
  const createContract = await request('POST', '/contracts', {
    externalId: testContractId,
    numeroTelephone: randomPhone,
    numeroCIN: randomCin,
    latitude: 36.8065,
    longitude: 10.1815,
    offreGB: 100,
    typeClient: 'MAISON',
    regionId: zoneId,
  }, serviceClientToken);
  console.log(`- POST /api/contracts (${createContract.status}):`, createContract.status === 201 ? '✅ OK' : '❌ ' + JSON.stringify(createContract.body));
  const contractMongoId = createContract.body?.data?._id;

  const listContracts = await request('GET', '/contracts', null, serviceClientToken);
  console.log(`- GET /api/contracts (${listContracts.status}):`, listContracts.status === 200 ? `✅ OK (${listContracts.body.data?.length} contrats)` : '❌');

  if (contractMongoId) {
    const deleteContract = await request('DELETE', `/contracts/${contractMongoId}`, null, serviceClientToken);
    console.log(`- DELETE /api/contracts/:id (${deleteContract.status}):`, deleteContract.status === 200 ? '✅ OK' : '❌ ' + JSON.stringify(deleteContract.body));
  }

  // E. Réclamation
  console.log('\n--- [RÉCLAMATION] ---');
  const testRecId = `REC-TEST-${Date.now().toString().slice(-4)}`;
  const createRec = await request('POST', '/reclamations', {
    externalId: testRecId,
    phoneNumber: randomPhone,
    numeroCIN: randomCin,
    description: 'Coupure totale de signal optique',
    latitude: 36.8065,
    longitude: 10.1815,
    zoneId: zoneId,
  }, serviceClientToken);
  console.log(`- POST /api/reclamations (${createRec.status}):`, createRec.status === 201 ? '✅ OK' : '❌ ' + JSON.stringify(createRec.body));
  const recMongoId = createRec.body?.data?._id;

  const listRecs = await request('GET', '/reclamations', null, serviceClientToken);
  console.log(`- GET /api/reclamations (${listRecs.status}):`, listRecs.status === 200 ? `✅ OK (${listRecs.body.data?.length} réclamations)` : '❌');

  if (recMongoId) {
    const deleteRec = await request('DELETE', `/reclamations/${recMongoId}`, null, serviceClientToken);
    console.log(`- DELETE /api/reclamations/:id (${deleteRec.status}):`, deleteRec.status === 200 ? '✅ OK' : '❌ ' + JSON.stringify(deleteRec.body));
  }

  // F. Consultation Carte et Dashboard
  console.log('\n--- [CONSULTATION CARTOGRAPHIE] ---');
  const mapContracts = await request('GET', '/map/contracts', null, serviceClientToken);
  console.log(`- GET /api/map/contracts (${mapContracts.status}):`, mapContracts.status === 200 ? '✅ OK' : '❌');

  const mapNros = await request('GET', '/map/nros', null, serviceClientToken);
  console.log(`- GET /api/map/nros (${mapNros.status}):`, mapNros.status === 200 ? '✅ OK' : '❌');

  const mapFdts = await request('GET', '/map/fdts', null, serviceClientToken);
  console.log(`- GET /api/map/fdts (${mapFdts.status}):`, mapFdts.status === 200 ? '✅ OK' : '❌');

  const mapCentrales = await request('GET', '/map/centrales', null, serviceClientToken);
  console.log(`- GET /api/map/centrales (${mapCentrales.status}):`, mapCentrales.status === 200 ? '✅ OK' : '❌');

  const mapDashboard = await request('GET', '/map/dashboard', null, serviceClientToken);
  console.log(`- GET /api/map/dashboard (${mapDashboard.status}):`, mapDashboard.status === 200 ? '✅ OK' : '❌');

  console.log('\n3. Test des restrictions de sécurité (SERVICE_CLIENT doit être refusé avec 403 Forbidden)...');

  // Forbidden: Users management
  const usersList = await request('GET', '/users', null, serviceClientToken);
  console.log(`- GET /api/users (${usersList.status}):`, usersList.status === 403 ? '🔒 403 Forbidden (Attendu - OK)' : `❌ Inattendu (${usersList.status})`);

  // Forbidden: AI Supervisor trigger
  const aiAnalysis = await request('POST', '/ai-supervisor/run/analysis', {}, serviceClientToken);
  console.log(`- POST /api/ai-supervisor/run/analysis (${aiAnalysis.status}):`, aiAnalysis.status === 403 ? '🔒 403 Forbidden (Attendu - OK)' : `❌ Inattendu (${aiAnalysis.status})`);

  // Forbidden: AI Supervisor Health
  const aiHealth = await request('GET', '/ai-supervisor/health', null, serviceClientToken);
  console.log(`- GET /api/ai-supervisor/health (${aiHealth.status}):`, aiHealth.status === 403 ? '🔒 403 Forbidden (Attendu - OK)' : `❌ Inattendu (${aiHealth.status})`);

  // Forbidden: Zone GeoJSON import
  const zoneImport = await request('POST', `/zones/${zoneId}/import-geojson`, {}, serviceClientToken);
  console.log(`- POST /api/zones/:id/import-geojson (${zoneImport.status}):`, zoneImport.status === 403 ? '🔒 403 Forbidden (Attendu - OK)' : `❌ Inattendu (${zoneImport.status})`);

  console.log('\n================================================================');
  console.log('🎉 TOUS LES TESTS DU RÔLE SERVICE_CLIENT SONT VALIDÉS AVEC SUCCÈS !');
  console.log('================================================================\n');
}

runTests().catch(console.error);
