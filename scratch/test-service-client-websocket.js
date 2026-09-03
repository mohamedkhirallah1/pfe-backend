const http = require('http');
const { io } = require('socket.io-client');

const BASE_URL = 'http://localhost:3001/api';
const WS_URL = 'http://localhost:3001';

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

async function testWebSocketNotifications() {
  console.log('================================================================');
  console.log('📡 TEST WEBSOCKET ET NOTIFICATIONS EN TEMPS RÉEL (SERVICE_CLIENT)');
  console.log('================================================================\n');

  // 1. Authentification
  const adminLogin = await request('POST', '/auth/login', {
    email: 'admin@smartfiber.tn',
    password: 'admin1234',
  });
  const adminToken = adminLogin.body.accessToken;

  const zoneLogin = await request('POST', '/auth/login', {
    email: 'zone_tunis@smartfiber.tn',
    password: 'zone1234',
  });
  const zoneToken = zoneLogin.body.accessToken;

  const scLogin = await request('POST', '/auth/login', {
    email: 'serviceclient@smartfiber.tn',
    password: 'service1234',
  });
  const scToken = scLogin.body.accessToken;

  console.log('✅ Tokens JWT obtenus pour ADMIN, RESPONSABLE_ZONE et SERVICE_CLIENT');

  // 2. Connexion Sockets
  const adminReceived = [];
  const adminSocket = io(WS_URL, {
    auth: { token: adminToken },
    transports: ['websocket', 'polling'],
  });

  const zoneReceived = [];
  const zoneSocket = io(WS_URL, {
    auth: { token: zoneToken },
    transports: ['websocket', 'polling'],
  });

  await new Promise((resolve) => {
    let connected = 0;
    const check = () => {
      connected++;
      if (connected === 2) resolve();
    };
    adminSocket.on('connect', () => {
      console.log('🔌 Socket ADMIN connecté');
      check();
    });
    zoneSocket.on('connect', () => {
      console.log('🔌 Socket RESPONSABLE_ZONE connecté');
      check();
    });
  });

  adminSocket.onAny((event, data) => {
    adminReceived.push({ event, data });
    console.log(`  [ADMIN WS Event] 📩 "${event}":`, typeof data === 'object' ? data.message || data.type || data.nom || data.externalId : data);
  });

  zoneSocket.onAny((event, data) => {
    zoneReceived.push({ event, data });
    console.log(`  [ZONE WS Event] 📩 "${event}":`, typeof data === 'object' ? data.message || data.type || data.nom || data.externalId : data);
  });

  // Get zone ID for Tunis
  const zonesRes = await request('GET', '/zones', null, scToken);
  const tunisZone = zonesRes.body?.find(z => z.name === 'Tunis') || zonesRes.body?.[0];
  const zoneId = tunisZone?._id;

  console.log(`\n3. SERVICE_CLIENT effectue des créations et suppressions (Zone=${tunisZone?.name})...`);

  // A. Créer une Centrale par SERVICE_CLIENT
  const testCentraleCode = `CO-WS-${Date.now().toString().slice(-4)}`;
  const createCentrale = await request('POST', '/centrales', {
    nom: 'Centrale Notification WS',
    code: testCentraleCode,
    ville: 'Tunis',
    regionId: zoneId,
    position: [10.1815, 36.8065],
    capaciteTotal: 800,
  }, scToken);
  console.log(`- POST /api/centrales: HTTP ${createCentrale.status}`);

  // B. Créer un Contrat par SERVICE_CLIENT
  const randomPhone = `97${Math.floor(100000 + Math.random() * 900000)}`;
  const randomCin = `06${Math.floor(100000 + Math.random() * 900000)}`;
  const createContract = await request('POST', '/contracts', {
    externalId: `CTR-WS-${Date.now().toString().slice(-4)}`,
    numeroTelephone: randomPhone,
    numeroCIN: randomCin,
    latitude: 36.8065,
    longitude: 10.1815,
    offreGB: 50,
    typeClient: 'MAISON',
    regionId: zoneId,
  }, scToken);
  console.log(`- POST /api/contracts: HTTP ${createContract.status}`);

  // C. Créer une Réclamation par SERVICE_CLIENT
  const createRec = await request('POST', '/reclamations', {
    externalId: `REC-WS-${Date.now().toString().slice(-4)}`,
    phoneNumber: randomPhone,
    numeroCIN: randomCin,
    description: 'Problème débit faible',
    latitude: 36.8065,
    longitude: 10.1815,
    zoneId: zoneId,
  }, scToken);
  console.log(`- POST /api/reclamations: HTTP ${createRec.status}`);

  // Attendre propagation WebSocket
  await new Promise((r) => setTimeout(r, 1500));

  console.log('\n4. Vérification des événements reçus...');
  console.log(`- ADMIN a reçu ${adminReceived.length} événements WebSocket :`, adminReceived.map(e => e.event));
  console.log(`- RESPONSABLE_ZONE a reçu ${zoneReceived.length} événements WebSocket :`, zoneReceived.map(e => e.event));

  // Nettoyage
  if (createCentrale.body?._id) {
    await request('DELETE', `/centrales/${createCentrale.body._id}`, null, scToken);
  }
  if (createContract.body?.data?._id) {
    await request('DELETE', `/contracts/${createContract.body.data._id}`, null, scToken);
  }
  if (createRec.body?.data?._id) {
    await request('DELETE', `/reclamations/${createRec.body.data._id}`, null, scToken);
  }

  adminSocket.disconnect();
  zoneSocket.disconnect();

  console.log('\n================================================================');
  console.log('🎉 VALIDATION WEBSOCKET & NOTIFICATIONS RÉUSSIE !');
  console.log('================================================================\n');
}

testWebSocketNotifications().catch(console.error);
