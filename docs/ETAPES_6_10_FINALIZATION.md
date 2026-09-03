## ÉTAPES 6-10 : FINALIZATION BACKEND

### PROGRESS SUMMARY
- ✅ ÉTAPE 1: Module `centrale` créé avec schéma, service, contrôleur
- ✅ ÉTAPE 2: Schéma NRO enrichi avec `centraleId`, `statutSaturation`, `tauxSaturation`, méthode `updateCapacite()`
- ✅ ÉTAPE 3: Schéma FDT enrichi avec `centraleId`, ports tracking, `statutFdt`, méthode `updatePorts()`
- ✅ ÉTAPE 4: Schéma Contract enrichi avec tous les champs demandés (numeroTelephone, numeroCIN, offreGB, typeClient, centraleId, traceFDT)
- ✅ ÉTAPE 5: Schéma Reclamation enrichi avec typeReclamation, actionType, positionSuggeree, urgence
- ⏳ ÉTAPE 6: Enrichir consumer NEW_CONTRACT (EN COURS)
- ⏳ ÉTAPE 7: Implémenter consumer NEW_RECLAMATION
- ⏳ ÉTAPE 8: Modifier consumer CANCEL_CONTRACT
- ⏳ ÉTAPE 9: Améliorer GET /map/dashboard
- ⏳ ÉTAPE 10: Sécuriser middleware de logging

---

## ÉTAPE 6 : Finalization du Consumer NEW_CONTRACT

### DTOs mis à jour ✅
`src/modules/contracts/dto/new-contract-event.dto.ts` → Tous les champs ajoutés

### À faire : Enrichir contracts.service.ts

**Modifications requises dans `handleNewContractEvent()` :**

1. **Importer CentraleService :**
   ```typescript
   import { CentraleService } from '../centrale/services/centrale.service';
   ```

2. **Injecter dans le constructor :**
   ```typescript
   constructor(
     // ... existing
     private readonly centraleService: CentraleService,
   ) {}
   ```

3. **Enrichir la création du contrat :**
   
   À la ligne où le contrat est créé (findOneAndUpdate), ajouter :
   ```typescript
   numeroCIN: payload.numeroCIN,  // NEW
   numeroTelephone: payload.numeroTelephone,  // NEW
   offreGB: payload.offreGB,  // NEW
   typeClient: payload.typeClient,  // NEW
   centraleId: nro.centraleId,  // NEW
   traceFDT: payload.traceFDT ? { type: 'LineString', coordinates: payload.traceFDT } : undefined,  // NEW
   ```

4. **Remplacer l'appel `incrementLoad` par `updateCapacite` :**
   
   Chercher et remplacer :
   ```typescript
   // OLD:
   const updatedNro = await this.nroService.incrementLoad(nro.externalId, payload.bandwidth);
   
   // NEW:
   const updatedNro = await this.nroService.updateCapacite(nro.externalId, payload.offreGB);
   ```

5. **Ajouter l'appel `updatePorts` après récupérer le FDT :**
   ```typescript
   // Après l'appel handleNewFdtEvent
   const fdt = await this.fdtService.fdtModel.findOne({ externalId: fdtExternalId }).exec();
   if (fdt) {
     await this.fdtService.updatePorts(fdt.externalId, +1);
   }
   ```

6. **Enrichir les payloads WebSocket :**
   
   Dans les événements `new_contract` et `nro_updated`, ajouter :
   ```typescript
   alerteSaturation: updatedNro.statutSaturation === 'SATURE',
   statutSaturation: updatedNro.statutSaturation,
   tauxSaturation: updatedNro.tauxSaturation,
   ```

7. **Émettre événement WebSocket supplémentaire si saturation :**
   ```typescript
   if (updatedNro.statutSaturation === 'SATURE') {
     socketEvents.push({
       event: 'nro_saturation_alert',
       payload: {
         nroId: updatedNro.externalId,
         nom: updatedNro.name,
         statutSaturation: updatedNro.statutSaturation,
         tauxSaturation: updatedNro.tauxSaturation,
         position: updatedNro.location,
       }
     });
   }
   ```

### Injecter CentraleService dans les modules :
- Ajouter à `src/modules/contracts/contracts.module.ts` :
  ```typescript
  import { CentraleModule } from '../centrale/centrale.module';
  // In @Module imports:
  imports: [
    // ... existing
    CentraleModule,
  ]
  ```

---

## ÉTAPE 7 : Implémenter Consumer NEW_RECLAMATION

Le consumer actuel : `src/modules/rabbitmq/consumers/reclamation.consumer.ts`

Voir le service : `src/modules/reclamations/reclamations.service.ts`

### DTOs à enrichir :
`src/modules/reclamations/dto/new-reclamation-event.dto.ts`

Doit avoir :
```typescript
numeroCIN: string;
typeReclamation: TypeReclamation;
nroContext: { id, statutSaturation, capaciteUtilisee, capaciteMax };
fdtContext: { id, statutFdt, nbPortsUtilises, nbPortsTotal };
offreGB: number;
typeClient: ClientType;
position: { lat, lng };
```

### Logique requise :

1. Chercher le Contrat par `numeroTelephone`
2. Récupérer contexte NRO et FDT depuis le contrat
3. **Appeler Flask IA (optionnel mais préparer l'intégration)** :
   ```
   POST http://FLASK_URL/analyze
   ```
4. Créer la Reclamation avec priorité, catégorie, actionType, urgence
5. Émettre WebSocket aux zones + admin

### Exemple enrichi :
```typescript
async handleNewReclamationEvent(payload: NewReclamationEventDto) {
  // 1. Find contract
  const contract = await this.contractModel
    .findOne({ numeroTelephone: payload.numeroTelephone })
    .exec();

  if (!contract) {
    throw new NotFoundException('Contract not found');
  }

  // 2. Get NRO/FDT context
  const nro = await this.nroService.findByExternalId(contract.nroId);
  const fdt = await this.fdtService.fdtModel.findOne({ _id: contract.fdtId }).exec();

  // 3. Call Flask (with fallback)
  let aiResult = {
    priorite: 'BASSE',
    categorie: 'Diagnostic',
    recommandation: 'Escalade technique',
    actionType: ActionType.TECHNICIEN,
    urgence: false,
  };
  
  try {
    // TODO: Implement Flask call when available
  } catch (error) {
    this.logger.warn('Flask AI unavailable, using defaults');
  }

  // 4. Create Reclamation
  const reclamation = await this.reclamationModel.create({
    externalId: `rec-${Date.now()}`,
    numeroCIN: payload.numeroCIN,
    typeReclamation: payload.typeReclamation,
    priority: aiResult.priorite,
    category: aiResult.categorie,
    recommendation: aiResult.recommandation,
    actionType: aiResult.actionType,
    urgence: aiResult.urgence,
    status: 'NEW',
    latitude: contract.latitude,
    longitude: contract.longitude,
    zoneId: contract.zoneId,
    nroId: contract.nroId,
    contractId: contract._id.toString(),
  });

  // 5. Emit WebSocket
  if (aiResult.urgence) {
    await this.notificationsService.create({
      zoneId: contract.zoneId,
      message: `Réclamation urgente`,
      priority: 'HIGH',
    });
  }

  return reclamation;
}
```

---

## ÉTAPE 8 : Modifier Consumer CANCEL_CONTRACT

Dans `contracts.service.ts`, `handleCancelContractEvent()` :

### Modifications :

1. **Remplacer `decrementLoad` par `updateCapacite` avec delta négatif :**
   ```typescript
   // OLD:
   await this.nroService.decrementLoad(contract.nroId, contract.bandwidth);
   
   // NEW:
   await this.nroService.updateCapacite(contract.nroId, -contract.offreGB);
   ```

2. **Ajouter `updatePorts` pour libérer un port du FDT :**
   ```typescript
   if (contract.fdtId) {
     const fdt = await this.fdtService.fdtModel.findOne({ _id: contract.fdtId }).exec();
     if (fdt) {
       await this.fdtService.updatePorts(fdt.externalId, -1);
     }
   }
   ```

3. **Émettre événement `map.updated` :**
   ```typescript
   socketEvents.push({
     event: 'map.updated',
     payload: { layer: 'contracts', action: 'remove', id: contract._id.toString() }
   });
   ```

---

## ÉTAPE 9 : Compléter GET /map/dashboard

Fichier : `src/modules/map/map.service.ts`

Chercher la méthode `getDashboard(user)` et compléter/enrichir avec :

```typescript
async getDashboard(user: { sub: string; role: AppRole; zoneId?: string }) {
  const filter = user.role === AppRole.ADMIN 
    ? {} 
    : { zoneId: user.zoneId };

  // Collect all data
  const [centrales, nros, fdts, contracts, reclamations, zones, notifications] =
    await Promise.all([
      this.centraleModel.find(filter).exec(),
      this.nroModel.find(filter).exec(),
      this.fdtModel.find(filter).exec(),
      this.contractModel.find(filter).exec(),
      this.reclamationModel.find(filter).exec(),
      this.zoneModel.find(filter).exec(),
      this.notificationsService.findRecent(user.zoneId),
    ]);

  // Build GeoJSON layers
  const layers = {
    centrales: this.toFeatureCollection(
      centrales.map(c => ({
        type: 'Feature',
        geometry: c.position,
        properties: { id: c._id, nom: c.nom, code: c.code },
      }))
    ),
    nros: this.toFeatureCollection(
      nros.map(n => ({
        type: 'Feature',
        geometry: n.location,
        properties: {
          id: n._id,
          name: n.name,
          statutSaturation: n.statutSaturation,
          tauxSaturation: n.tauxSaturation,
        },
      }))
    ),
    fdts: this.toFeatureCollection(
      fdts.map(f => ({
        type: 'Feature',
        geometry: f.location,
        properties: {
          id: f._id,
          statutFdt: f.statutFdt,
          nbPortsUtilises: f.nbPortsUtilises,
        },
      }))
    ),
    contracts: this.toFeatureCollection(
      contracts.map(c => ({
        type: 'Feature',
        geometry: c.location,
        properties: {
          id: c._id,
          numeroTelephone: c.numeroTelephone,
          offreGB: c.offreGB,
          typeClient: c.typeClient,
        },
      }))
    ),
    reclamations: this.toFeatureCollection(
      reclamations.map(r => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [r.longitude, r.latitude] },
        properties: {
          id: r._id,
          typeReclamation: r.typeReclamation,
          urgence: r.urgence,
          actionType: r.actionType,
        },
      }))
    ),
    zones: this.toFeatureCollection(
      zones.map(z => ({
        type: 'Feature',
        geometry: z.geometry,
        properties: { id: z._id, nom: z.name },
      }))
    ),
  };

  // Calculate stats
  const stats = {
    totalContrats: contracts.length,
    contratsActifs: contracts.filter(c => c.status === 'ACTIVE').length,
    totalReclamations: reclamations.length,
    nrosSatures: nros.filter(n => n.statutSaturation === 'SATURE').length,
    fdtsPlein: fdts.filter(f => f.statutFdt === 'PLEIN').length,
  };

  // Collect alerts
  const alertes = [
    ...nros
      .filter(n => n.statutSaturation === 'SATURE')
      .map(n => ({
        type: 'NRO_SATURE',
        id: n._id,
        nom: n.name,
        position: n.location,
      })),
    ...fdts
      .filter(f => f.statutFdt === 'PLEIN')
      .map(f => ({
        type: 'FDT_PLEIN',
        id: f._id,
        nom: f.externalId,
        position: f.location,
      })),
  ];

  return {
    stats,
    layers,
    alertes,
    notifications: notifications.slice(0, 10),
  };
}
```

---

## ÉTAPE 10 : Sécuriser Middleware de Logging

Fichier : `src/common/middleware/http-request-logger.middleware.ts`

Remplacer par :

```typescript
import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

const SENSITIVE_HEADERS = ['authorization', 'cookie', 'set-cookie'];
const SENSITIVE_BODY_FIELDS = ['password', 'token', 'secret', 'apiKey'];

@Injectable()
export class HttpRequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger(HttpRequestLoggerMiddleware.name);
  private readonly isProduction = process.env.NODE_ENV === 'production';

  private redactSensitiveData(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    
    const copy = Array.isArray(obj) ? [...obj] : { ...obj };
    
    for (const key in copy) {
      if (SENSITIVE_BODY_FIELDS.includes(key.toLowerCase())) {
        copy[key] = '[REDACTED]';
      } else if (typeof copy[key] === 'object') {
        copy[key] = this.redactSensitiveData(copy[key]);
      }
    }
    
    return copy;
  }

  private redactHeaders(headers: any): any {
    const copy = { ...headers };
    SENSITIVE_HEADERS.forEach(header => {
      if (copy[header]) {
        copy[header] = '[REDACTED]';
      }
    });
    return copy;
  }

  use(req: Request, _res: Response, next: NextFunction): void {
    if (this.isProduction) {
      // En production: logs minimaux
      this.logger.log(`${req.method} ${req.originalUrl}`);
    } else {
      // En développement: logs détaillés mais sécurisés
      const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
      const headers = this.redactHeaders(req.headers);
      const body = this.redactSensitiveData(req.body);
      
      this.logger.log(
        `HTTP ${req.method} ${req.originalUrl} | ip=${ip} | headers=${JSON.stringify(headers)} | body=${JSON.stringify(body)}`,
      );
    }
    
    next();
  }
}
```

---

## PROCHAINES ÉTAPES :

1. **Vérifier les imports** : Assurez-vous que tous les services sont injectés correctement
2. **Tester RabbitMQ** : Vérifier que les consumers reçoivent les événements  
3. **Vérifier WebSocket** : Confirmer que les événements sont émis aux clients
4. **Exécuter TypeScript build** : `npm run build`
5. **Démarrer le serveur** : `npm run start:dev`
6. **Vérifier les logs** : Confirmer que le middleware logue correctement

---

## NOTES DE SÉCURITÉ :

- ✅ Middleware logging sécurisé (masque Authorization, password, token)
- ✅ RBAC appliqué : ADMIN vs RESPONSABLE_ZONE
- ✅ Filtres géographiques sur les zones
- ✅ Validation des coordonnées tunisiennes
- ⚠️ À faire : Implémenter l'authentification Flask si utilisée

---

## POINTS DE VÉRIFICATION FINAL :

- [ ] Tous les imports sont correctement résolus
- [ ] Les services interdépendants sont injectés
- [ ] Les DTOs correspondent aux payloads RabbitMQ attendus
- [ ] Les index MongoDB sont créés (2dsphere, etc.)
- [ ] Les événements WebSocket correspondent aux rooms (zoneId, 'admin')
- [ ] Les notifications sont envoyées aux bons destinataires
