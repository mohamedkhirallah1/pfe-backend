# 🚀 FLUTTER MAP IMPLEMENTATION PROMPT FOR COPILOT
## Smart Fiber Backend - Flutter Frontend Integration Guide

---

## 📋 CONTEXT

You are an expert Flutter developer integrating with Smart Fiber Backend (NestJS + MongoDB).

### Backend Architecture
- **Framework:** NestJS 10.x with global `/api` prefix
- **Database:** MongoDB with GeoJSON (Points, Polygons, LineStrings)
- **Auth:** JWT + RBAC (ADMIN, RESPONSABLE_ZONE)
- **Data Format:** GeoJSON FeatureCollections
- **Real-time:** WebSocket/Socket.IO

### Frontend Requirements (Flutter)
- **UI Framework:** Flutter with Material Design
- **Map Library:** google_maps_flutter OR flutter_map (with OpenStreetMap)
- **HTTP Client:** http or dio package
- **WebSocket:** web_socket_channel package
- **State Management:** Provider, Riverpod, or GetX
- **Target:** iOS + Android

---

## ⚡ KEY BACKEND ENDPOINTS

### Authentication
```
POST /api/auth/login
Request: { "username": "zone_tunis", "password": "..." }
Response: { "accessToken": "eyJ...", "user": { "id": "...", "username": "zone_tunis", "email": "zone_tunis@smartfiber.tn", "role": "RESPONSABLE_ZONE", "zoneId": "..." } }
```

### Main Dashboard (All Data in One Call)
```
GET /api/map/dashboard
Authorization: Bearer <JWT_TOKEN>

Response: {
  "stats": { "zones": 12, "contracts": 2847, ... },
  "layers": {
    "zones": { GeoJSON - Polygons },
    "contracts": { GeoJSON - Points },
    "central-fibers": { GeoJSON - Points },
    "nros": { GeoJSON - Points },
    "fdts": { GeoJSON - Points },
    "reclamations": { GeoJSON - Points },
    "topology-graph": { GeoJSON - LineStrings } ← IMPORTANT for topology paths
  },
  "history": [ Notifications ]
}
```

---

## 🎨 VISUAL REQUIREMENTS

### Map Markers (Icons/Assets Needed)
Create these PNG assets (48x48 or 64x64 px):

1. **Central Fiber (CF)** 
   - Icon: 🏢 Building/Hub icon (blue)
   - Color: #0066FF (blue)

2. **NRO** (Network Reach-Out)
   - Icon: 🔌 Network node (yellow)
   - Color: #FFB800 (yellow)

3. **FDT** (Fiber Distribution Terminal)
   - Icon: 📡 Distribution point (orange)
   - Color: #FF8800 (orange)

4. **Contract** (Client)
   - Icon: 👥 User/house icon (green/red based on saturation)
   - Color: GREEN (<50%), YELLOW (50-70%), RED (>70%)

5. **Reclamation** (Complaint)
   - Icon: ⚠️ Alert/warning icon (red)
   - Color: #FF0000 (red)

### Color Coding by Saturation
```
< 50%    → GREEN   (#00AA00)
50-70%   → YELLOW  (#FFFF00)
> 70%    → RED     (#FF0000)
```

### Topology Paths (LineStrings)
```
CF → NRO → FDT → Contract = Blue LineString connecting markers
Line width: 2-3 px
Opacity: 0.7
Pattern: Solid or dashed for visibility
```

---

## 📦 PROJECT STRUCTURE

```
lib/
├── main.dart
├── models/
│   ├── geojson_models.dart
│   ├── user_model.dart
│   └── dashboard_model.dart
├── services/
│   ├── api_service.dart
│   ├── auth_service.dart
│   ├── websocket_service.dart
│   └── location_service.dart
├── providers/
│   ├── auth_provider.dart
│   ├── dashboard_provider.dart
│   └── map_provider.dart
├── screens/
│   ├── login_screen.dart
│   ├── map_screen.dart
│   ├── dashboard_screen.dart
│   └── details_screen.dart
├── widgets/
│   ├── map_widget.dart
│   ├── layer_toggle_widget.dart
│   ├── statistics_panel_widget.dart
│   └── custom_markers.dart
└── assets/
    ├── icons/
    │   ├── central_fiber.png
    │   ├── nro.png
    │   ├── fdt.png
    │   ├── contract_green.png
    │   ├── contract_yellow.png
    │   ├── contract_red.png
    │   └── reclamation.png
    └── fonts/
```

---

## 🏗️ STEP 1: Setup Dependencies

### pubspec.yaml
```yaml
dependencies:
  flutter:
    sdk: flutter
  google_maps_flutter: ^2.2.0  # OR flutter_map: ^5.1.0
  http: ^1.1.0
  web_socket_channel: ^2.4.0
  provider: ^6.0.0
  geolocator: ^9.0.0
  flutter_launcher_icons: ^0.13.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  integration_test:
    package: integration_test
```

---

## 🔐 STEP 2: Authentication Service

### Prompt for Copilot:
```
Je dois créer un service d'authentification Flutter pour l'API Smart Fiber.

Requirements:
1. AuthService class qui:
   - Fait POST à http://localhost:3000/api/auth/login avec { username, password }
   - Récupère le JWT token et l'utilisateur
   - Stocke le token dans SharedPreferences (sécurisé)
   - Gère les erreurs (401, connexion refusée)
   - Fournit les méthodes: login(), logout(), isAuthenticated(), getToken(), getUser()

2. Dto/Model classes:
   - LoginRequest { username, password }
   - LoginResponse { accessToken, user }
   - User { id, username, email?, role, zoneId?, ... }

3. HttpClient avec interceptor qui:
   - Ajoute le JWT token en Authorization header à TOUS les requests
   - Gère les erreurs 401 (logout automatique)
   - Parse les erreurs avec messages user-friendly

Production quality avec error handling.
```

---

## 🗺️ STEP 3: GeoJSON Parsing & Models

### Prompt for Copilot:
```
Je dois parser des réponses GeoJSON du backend Smart Fiber en Flutter.

Le backend retourne:
{
  "stats": { "zones": 12, "contracts": 2847, ... },
  "layers": {
    "zones": { "type": "FeatureCollection", "features": [...Polygons...] },
    "contracts": { "type": "FeatureCollection", "features": [...Points...] },
    "central-fibers": { "type": "FeatureCollection", "features": [...Points...] },
    "nros": { "type": "FeatureCollection", "features": [...Points...] },
    "fdts": { "type": "FeatureCollection", "features": [...Points...] },
    "reclamations": { "type": "FeatureCollection", "features": [...Points...] },
    "topology-graph": { "type": "FeatureCollection", "features": [...LineStrings...] }
  },
  "history": [...]
}

Requêtes:
1. Crée une classe DashboardResponse qui parse toute cette structure

2. Crée des classes pour chaque type:
   - ZoneFeature { id, name, geometry (Polygon), properties }
   - ContractFeature { id, externalId, clientName, location (Point), properties }
   - CentralFiberFeature { id, name, location (Point), saturationRate, properties }
   - NroFeature { id, name, location (Point), saturationRate, properties }
   - FdtFeature { id, name, location (Point), utilizationRate, properties }
   - ReclamationFeature { id, subject, location (Point), priority, properties }
   - TopologyPathFeature { type: LineString, coordinates }

3. Fonction parseGeojson() qui:
   - Prend la réponse JSON du backend
   - Mappe les Points to LatLng
   - Mappe les Polygons to List<LatLng>
   - Mappe les LineStrings to List<LatLng>
   - Retourne DashboardData structuré

4. Extensions sur les types pour faciliter l'usage:
   - Feature.getCenter() → LatLng
   - Feature.getSaturationColor() → Color (green/yellow/red)
   - Feature.getIcon() → AssetImage

Production quality avec null safety et error handling.
```

---

## 📍 STEP 4: Map Widget with Custom Markers & Polylines

### Prompt for Copilot:
```
Je dois créer un widget Flutter pour afficher une map Google Maps (ou flutter_map)
avec plusieurs types de markers et des polylines de topology.

Requirements:
1. SmartFiberMap widget qui:
   - Initialise une GoogleMap/FlutterMap
   - Centre sur Tunisia [36.806, 10.195] avec zoom 12
   - Ajoute les 7 layers de données GeoJSON

2. Custom Markers pour chaque type:
   - Central Fiber: Icon bleu (#0066FF) avec buildInfo(): CentralFiber name, saturation rate
   - NRO: Icon jaune (#FFB800) avec buildInfo(): NRO name, saturation rate
   - FDT: Icon orange (#FF8800) avec buildInfo(): FDT name, utilization rate
   - Contract: Icon (GREEN/YELLOW/RED) avec buildInfo(): Client name, status
   - Reclamation: Icon rouge (#FF0000) avec buildInfo(): Subject, priority

3. Polylines pour topology (CF→NRO→FDT→Contract):
   - Chaque topology path est une LineString du backend
   - Drawpolylines avec:
     * Color: #0066FF (blue)
     * Width: 2-3
     * Opacity: 0.7
   - Au click sur polyline, affiche le chemin détaillé

4. Layer Toggle:
   - CheckBox ou BottomSheet avec toggles pour chaque layer
   - Show/hide chaque layer dynamiquement

5. Popups au click sur marker:
   - Affiche les informations du marker
   - Boutons d'action si applicable (Report Issue, etc.)

Production quality avec custom marker rendering, responsive design.
```

---

## 🔄 STEP 5: Data Fetching & State Management

### Prompt for Copilot:
```
Je dois gérer l'état de la map et les données en Flutter avec Provider.

Requirements:
1. DashboardProvider (extends ChangeNotifier) qui:
   - Récupère les données du endpoint GET /api/map/dashboard
   - Gère les states: loading, error, data
   - Fournit les méthodes:
     * Future<void> loadDashboard() → fetch et updateState
     * void toggleLayer(String layerName) → show/hide layer
     * Stream<Notification> getNotifications() → WebSocket
   - Retourne: stats, layers, loading, error, visibleLayers

2. MapProvider qui:
   - Gère la position/zoom de la map
   - Gère les markers visibles basé sur DashboardProvider
   - Retourne: markers, polylines, polygons, camera position

3. Classe DashboardService qui:
   - Fait le GET /api/map/dashboard
   - Ajoute le Bearer token automatiquement
   - Parse la réponse GeoJSON
   - Retourne DashboardData

Production quality avec proper async/await et error handling.
```

---

## 🔔 STEP 6: WebSocket pour Real-Time Updates

### Prompt for Copilot:
```
Je dois implémenter WebSocket en Flutter pour les notifications en temps réel.

Backend: Socket.IO sur http://localhost:3000/api
Events: notification, topology.updated, contract.created, network.saturation

Requirements:
1. WebSocketService qui:
   - Se connecte à Socket.IO avec le JWT token
   - Gère la reconnection automatique
   - Écoute les events: notification, topology.updated, contract.created
   - Retourne un Stream<Event> pour les listeners

2. Au reçu d'un event:
   - Affiche une notification en haut de l'écran (SnackBar)
   - Appelle DashboardProvider.loadDashboard() pour rafraîchir
   - Affiche une toast "Map updated"

3. Gestion des erreurs:
   - Connection refused → affiche "Offline mode"
   - Connection restored → rafraîchit les données

Production quality avec StreamController et proper cleanup.
```

---

## 📊 STEP 7: UI - Map Screen Layout

### Prompt for Copilot:
```
Je dois créer l'écran principal avec la map et les contrôles.

Layout:
- Header: Logo app + user name + notifications badge
- Body:
  * Map (80% de l'écran)
  * Sidebar ou BottomSheet (20%) avec:
    - Statistics panel
    - Layer toggle checkboxes
    - Notifications list
- FloatingActionButton: "Create Contract" (New+)

Requirements:
1. MapScreen widget qui:
   - Affiche SmartFiberMap
   - Affiche statistics (zones count, contracts, etc.)
   - Affiche layer toggle
   - Affiche recent notifications
   - Responsive: sur mobile, utiliser BottomSheet au lieu de sidebar

2. Statistics Panel qui affiche:
   - Total zones (1 pour RESPONSABLE, 12 pour ADMIN)
   - Total contracts
   - Total reclamations
   - Total NROs
   - Total FDTs
   - Total Central Fibers

3. Layer Toggle avec checkboxes:
   - Zones
   - Central Fibers
   - NROs
   - FDTs
   - Contracts
   - Reclamations
   - Topology

4. Notifications List qui:
   - Affiche les 10 dernières notifications
   - Color-code: ZONE_MANAGER=blue, ADMIN=red
   - Au click, ouvre la notification complète

Production quality avec Material Design, responsive.
```

---

## 📝 STEP 8: Forms (Create Contract)

### Prompt for Copilot:
```
Je dois créer un formulaire pour créer des contrats en Flutter.

Requirements:
1. CreateContractDialog qui:
   - TextField: Client name, phone, email
   - DropDown: Package (10GB, 50GB, 100GB, 500GB, 1000GB)
   - DropDown: Client type (HOUSE, BUSINESS, BUILDING)
   - Button: "Pick Location on Map"
   - Affiche lat/lng sélectionné

2. Location Picker:
   - Ouvre une map
   - User tape sur la map pour sélectionner lat/lng
   - Ferme la map et retourne les coordonnées

3. Form Validation:
   - Email format validation
   - Phone format validation (+216...)
   - Coordonnées required
   - Package required

4. Submit:
   - POST /api/contracts avec Bearer token
   - Affiche "Creating..."
   - Au succès: "Contract created! Auto-linked to CF-001, NRO-001, FDT-001"
   - Au erreur: affiche le message d'erreur

Production quality avec validation, loading state.
```

---

## 🎨 STEP 9: Custom Markers Assets

### Prompt for Copilot:
```
Je dois créer des custom markers pour la map Flutter avec BitmapDescriptor.

Requirements:
1. Crée des fonctions pour générer les markers:
   - getMarkerIcon(type: 'central-fiber', saturation: 45) → BitmapDescriptor
   - getMarkerIcon(type: 'contract', saturation: 65) → BitmapDescriptor
   - getMarkerIcon(type: 'nro', saturation: 50) → BitmapDescriptor
   - getMarkerIcon(type: 'fdt', utilization: 75) → BitmapDescriptor
   - getMarkerIcon(type: 'reclamation', priority: 'CRITICAL') → BitmapDescriptor

2. Icons avec les couleurs:
   - Central Fiber: bleu #0066FF (48x48)
   - NRO: jaune #FFB800 (48x48)
   - FDT: orange #FF8800 (48x48)
   - Contract: GREEN/YELLOW/RED basé sur saturation (40x40)
   - Reclamation: rouge #FF0000 (48x48)

3. Options:
   - Si saturation >= 70%: use RED icon
   - Si 50% <= saturation < 70%: use YELLOW icon
   - Si saturation < 50%: use GREEN icon

Utilise BitmapDescriptor.fromBytes() ou Assets images.

Production quality avec caching.
```

---

## 🔐 STEP 10: Authentication & RBAC

### Prompt for Copilot:
```
Je dois implémenter RBAC en Flutter (ADMIN vs RESPONSABLE_ZONE).

Requirements:
1. AuthProvider qui:
   - Stocke user (avec role et zoneId)
   - Fournit hasRole(role) → bool
   - Fournit isAdmin() → bool
   - Fournit isZoneManager() → bool
   - Fournit getZoneId() → String?

2. UI Visibility basée sur role:
   - ADMIN only features:
     * User management menu
     * Zone management menu
     * Create Central Fiber button
     * Global statistics dashboard
   - RESPONSABLE features:
     * Create Contract button (sa zone seulement)
     * Create Reclamation (sa zone seulement)
     * View zone statistics

3. Data Filtering basée sur role:
   - ADMIN: voit les 12 zones, tous les contrats
   - RESPONSABLE: voit 1 zone, contrats de sa zone seulement
   - BACKEND filters les données, frontend double-check

4. Navigation:
   - Si not authenticated: LoginScreen
   - Si ADMIN: affiche Admin menu items
   - Si RESPONSABLE: affiche Zone manager menu items

Production quality avec proper abstraction.
```

---

## 🚀 DEPLOYMENT CHECKLIST

### Before Build
- [ ] pubspec.yaml updated with all dependencies
- [ ] Assets (icons) added to pubspec and imported
- [ ] API_URL environment variable configured
- [ ] JWT token storage using secure_storage package
- [ ] ProGuard rules for Android (if using obfuscation)

### Android Setup
```
android/app/build.gradle:
minSdkVersion: 21
targetSdkVersion: 33

android/app/src/main/AndroidManifest.xml:
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```

### iOS Setup
```
ios/Podfile:
platform :ios, '12.0'

ios/Runner/Info.plist:
<key>NSLocationWhenInUseUsageDescription</key>
<string>This app needs your location to display the map</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>This app needs your location to display the map</string>
```

### Build Commands
```bash
# Dev build
flutter run

# Release build
flutter build apk --release      # Android
flutter build ios --release      # iOS
flutter build web --release      # Web
```

---

## 📋 IMPLEMENTATION ORDER

### Day 1: Setup & Auth
- [ ] Create project structure
- [ ] Add dependencies to pubspec.yaml
- [ ] Implement AuthService
- [ ] Implement LoginScreen
- [ ] Test login with backend

### Day 2: Map Display
- [ ] Implement GeoJSON models
- [ ] Implement DashboardService
- [ ] Implement SmartFiberMap widget
- [ ] Add 7 layers to map

### Day 3: Markers & Topology
- [ ] Create custom marker assets
- [ ] Add markers for each layer type
- [ ] Add color coding (saturation)
- [ ] Add polylines for topology paths

### Day 4: State Management
- [ ] Implement DashboardProvider
- [ ] Implement MapProvider
- [ ] Add layer toggle
- [ ] Add statistics panel

### Day 5: Real-Time & WebSocket
- [ ] Implement WebSocketService
- [ ] Add real-time notifications
- [ ] Auto-refresh map on events

### Day 6: Forms
- [ ] Create contract form
- [ ] Location picker
- [ ] Form validation
- [ ] Submit to backend

### Day 7: Polish
- [ ] Error handling everywhere
- [ ] Loading states
- [ ] Responsive design
- [ ] Testing

---

## ✅ SUCCESS CRITERIA

Your Flutter app is production-ready when:
- ✅ Login works with JWT token storage
- ✅ Map displays all 7 GeoJSON layers
- ✅ 7 types of markers with custom icons visible
- ✅ Topology paths (polylines) connect CF→NRO→FDT→Contract
- ✅ Layer toggle works (show/hide)
- ✅ Color coding works (green/yellow/red by saturation)
- ✅ Statistics panel shows correct counts
- ✅ WebSocket connects and updates in real-time
- ✅ Contract creation works
- ✅ Reclamation creation works
- ✅ RBAC working (RESPONSABLE sees 1 zone, ADMIN sees all)
- ✅ No console errors
- ✅ Responsive on Android & iOS
- ✅ Performance acceptable (< 2s load time)

---

## 🎯 KEY FLUTTER PACKAGES

```
google_maps_flutter: ^2.2.0
  - Official Google Maps for Flutter
  - BitmapDescriptor for custom markers
  - Polyline support for topology paths

web_socket_channel: ^2.4.0
  - WebSocket support
  - Handles reconnection

provider: ^6.0.0
  - State management
  - Notifiers and listeners

http: ^1.1.0 or dio: ^5.0.0
  - HTTP requests
  - Interceptors for auth

geolocator: ^9.0.0
  - Get user current location
  - Handle permissions

flutter_secure_storage: ^9.0.0
  - Secure JWT token storage

```

---

## 🏆 ARCHITECTURE PATTERN

```
Models (Data classes)
  ↓
Services (API calls, WebSocket)
  ↓
Providers (State management)
  ↓
Screens (UI)
  ↓
Widgets (Reusable components)
```

---

**Your Flutter app is ready to be built!** 🚀

Copy each prompt section above and paste into Copilot Chat for code generation.

