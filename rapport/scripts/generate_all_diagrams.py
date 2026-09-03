import os
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import numpy as np

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG_DIR = os.path.join(BASE_DIR, 'images')
CH3_DIR = os.path.join(IMG_DIR, 'ch3')
CH4_DIR = os.path.join(IMG_DIR, 'ch4')
CH5_DIR = os.path.join(IMG_DIR, 'ch5')

for d in [IMG_DIR, CH3_DIR, CH4_DIR, CH5_DIR]:
    os.makedirs(d, exist_ok=True)

plt.rcParams['font.sans-serif'] = 'DejaVu Sans'
plt.rcParams['font.family'] = 'sans-serif'

PRIMARY = '#1A5276'
SECONDARY = '#2980B9'
ACCENT = '#C0392B'
BG_LIGHT = '#F8F9FA'
BOX_BG = '#EBF5FB'
BORDER = '#2C3E50'
TEXT_DARK = '#1C2833'
GREEN_SUCCESS = '#27AE60'
ORANGE_WARN = '#E67E22'

def draw_actor(ax, x, y, name, color='#2C3E50'):
    circle = plt.Circle((x, y + 0.35), 0.13, fill=True, color='#EBF5FB', ec=color, lw=1.8, zorder=4)
    ax.add_patch(circle)
    ax.plot([x, x], [y + 0.22, y - 0.18], color=color, lw=2.2, zorder=4)
    ax.plot([x - 0.22, x + 0.22], [y + 0.08, y + 0.08], color=color, lw=2.2, zorder=4)
    ax.plot([x, x - 0.18], [y - 0.18, y - 0.50], color=color, lw=2.2, zorder=4)
    ax.plot([x, x + 0.18], [y - 0.18, y - 0.50], color=color, lw=2.2, zorder=4)
    ax.text(x, y - 0.72, name, ha='center', va='top', fontsize=10, fontweight='bold', color=TEXT_DARK, zorder=5)

def draw_usecase(ax, x, y, w, h, text, color='#EBF5FB', ec='#2980B9'):
    ellipse = patches.Ellipse((x, y), w, h, facecolor=color, edgecolor=ec, lw=1.8, zorder=3)
    ax.add_patch(ellipse)
    ax.text(x, y, text, ha='center', va='center', fontsize=9.5, color=TEXT_DARK, fontweight='semibold', zorder=5, multialignment='center')

def draw_conn(ax, x1, y1, x2, y2, color='#7F8C8D', style='-', lw=1.5):
    ax.plot([x1, x2], [y1, y2], color=color, linestyle=style, lw=lw, zorder=2)

def draw_class_box(ax, x, y, w, h, title, attributes, methods, color='#FEF9E7', ec='#B7950B'):
    box = patches.FancyBboxPatch((x, y - h), w, h, boxstyle="round,pad=0.03", facecolor=color, edgecolor=ec, lw=1.8, zorder=3)
    ax.add_patch(box)
    header_h = 0.55
    header = patches.FancyBboxPatch((x, y - header_h), w, header_h, boxstyle="round,pad=0.03", facecolor=ec, edgecolor=ec, lw=1.8, zorder=3)
    ax.add_patch(header)
    ax.text(x + w/2, y - header_h/2, title, ha='center', va='center', fontsize=10.5, fontweight='bold', color='white', zorder=5)
    
    curr_y = y - header_h - 0.22
    for attr in attributes:
        ax.text(x + 0.12, curr_y, attr, ha='left', va='center', fontsize=8.5, color=TEXT_DARK, zorder=5)
        curr_y -= 0.25
        
    ax.plot([x, x + w], [curr_y + 0.1, curr_y + 0.1], color=ec, lw=1.2, zorder=4)
    curr_y -= 0.15
    for m in methods:
        ax.text(x + 0.12, curr_y, m, ha='left', va='center', fontsize=8.5, color='#1A5276', zorder=5)
        curr_y -= 0.25

def gen_usecase(title, actor, cases, out_path):
    fig, ax = plt.subplots(figsize=(10, 6.5), dpi=300)
    ax.set_xlim(-1, 11)
    ax.set_ylim(-1, 7.5)
    ax.axis('off')
    
    rect = patches.FancyBboxPatch((3.0, 0.2), 6.8, 7.0, boxstyle="round,pad=0.1", facecolor='#FDFEFE', edgecolor=PRIMARY, lw=2.2)
    ax.add_patch(rect)
    ax.text(6.4, 6.7, title, ha='center', fontsize=12, fontweight='bold', color=PRIMARY)
    
    draw_actor(ax, 1.2, 3.8, actor)
    
    curr_y = 5.5
    spacing = 4.8 / max(1, len(cases))
    for text in cases:
        draw_usecase(ax, 6.4, curr_y, 4.8, 0.8, text)
        draw_conn(ax, 1.5, 3.8, 6.4 - 2.4, curr_y)
        curr_y -= spacing
        
    plt.tight_layout()
    plt.savefig(out_path, bbox_inches='tight')
    plt.close()

def gen_sequence(title, lifelines, messages, out_path):
    fig, ax = plt.subplots(figsize=(14, 8.5), dpi=300)
    n = len(lifelines)
    ax.set_xlim(0, n * 3)
    ax.set_ylim(0, 10)
    ax.axis('off')
    
    coords = {}
    for i, name in enumerate(lifelines):
        x = 1.5 + i * 2.8
        coords[i] = x
        box = patches.FancyBboxPatch((x - 1.2, 9.0), 2.4, 0.75, boxstyle="round,pad=0.02", facecolor='#EBF5FB', edgecolor=PRIMARY, lw=1.6)
        ax.add_patch(box)
        ax.text(x, 9.38, name, ha='center', va='center', fontsize=8.5, fontweight='bold', color=PRIMARY)
        ax.plot([x, x], [0.5, 9.0], color='#BDC3C7', linestyle='--', lw=1.5)
        
    curr_y = 8.0
    y_step = 7.0 / max(1, len(messages))
    for src, dst, msg, fwd in messages:
        x1 = coords[src]
        x2 = coords[dst]
        if x1 == x2:
            ax.plot([x1, x1 + 0.8, x1 + 0.8, x1], [curr_y + 0.15, curr_y + 0.15, curr_y - 0.15, curr_y - 0.15], color=PRIMARY, lw=1.5)
            ax.text(x1 + 0.9, curr_y, msg, fontsize=8.5, va='center', color=TEXT_DARK)
        else:
            ax.annotate('', xy=(x2, curr_y), xytext=(x1, curr_y), arrowprops=dict(arrowstyle="->", color=ACCENT if not fwd else PRIMARY, lw=1.5))
            ax.text((x1 + x2)/2, curr_y + 0.15, msg, fontsize=8.5, ha='center', color=TEXT_DARK)
        curr_y -= y_step

    plt.tight_layout()
    plt.savefig(out_path, bbox_inches='tight')
    plt.close()

def gen_classes(title, class_list, out_path):
    fig, ax = plt.subplots(figsize=(14, 8), dpi=300)
    ax.set_xlim(0, 15)
    ax.set_ylim(0, 9)
    ax.axis('off')
    
    for c in class_list:
        draw_class_box(ax, c['x'], c['y'], c['w'], c['h'], c['title'], c['attrs'], c['methods'], c.get('bg', '#FEF9E7'), c.get('ec', '#B7950B'))
        
    plt.tight_layout()
    plt.savefig(out_path, bbox_inches='tight')
    plt.close()

# ==============================================================================
# Generate every single diagram matching the report page-by-page
# ==============================================================================
print("1. Generating Global Diagrams...")
# Global Use Case (Figure 2.1)
fig, ax = plt.subplots(figsize=(14, 9.5), dpi=300)
ax.set_xlim(-1, 15)
ax.set_ylim(-1, 11)
ax.axis('off')
rect = patches.FancyBboxPatch((3.2, 0.2), 8.6, 10.2, boxstyle="round,pad=0.1", facecolor='#FDFEFE', edgecolor=PRIMARY, lw=2.2)
ax.add_patch(rect)
ax.text(7.5, 10.0, "Plateforme Smart Fiber Supervision (Tunisie Telecom)", ha='center', va='center', fontsize=14, fontweight='bold', color=PRIMARY)
draw_actor(ax, 1.2, 8.5, "Administrateur\n(National)")
draw_actor(ax, 1.2, 4.8, "Responsable Zone\n(Régional)")
draw_actor(ax, 1.2, 1.6, "Technicien\n(Terrain)")
draw_actor(ax, 13.5, 5.0, "Système Externe\n(Sondes/Capteurs)")
cases = [
    (7.5, 9.0, 4.4, 0.9, "S'authentifier & Gérer les sessions"),
    (7.5, 7.8, 4.6, 0.9, "Administrer les utilisateurs & Rôles"),
    (7.5, 6.6, 4.8, 0.9, "Superviser la cartographie réseau (NRO/FDT)"),
    (7.5, 5.4, 4.6, 0.9, "Recevoir les alertes & flux temps réel"),
    (7.5, 4.2, 4.8, 0.9, "Consulter les tableaux de bord KPI"),
    (7.5, 3.0, 4.8, 0.9, "Enrichir & Traiter les réclamations (IA)"),
    (7.5, 1.8, 4.8, 0.9, "Détecter la saturation préventive NRO"),
    (7.5, 0.7, 4.4, 0.75, "Ingérer les événements d'infrastructure")
]
for x, y, w, h, text in cases:
    draw_usecase(ax, x, y, w, h, text)
for idx in [0, 1, 2, 3, 4, 5, 6]:
    draw_conn(ax, 1.5, 8.5, cases[idx][0] - cases[idx][2]/2, cases[idx][1])
for idx in [0, 2, 3, 4, 5]:
    draw_conn(ax, 1.5, 4.8, cases[idx][0] - cases[idx][2]/2, cases[idx][1])
for idx in [0, 2, 3]:
    draw_conn(ax, 1.5, 1.6, cases[idx][0] - cases[idx][2]/2, cases[idx][1])
draw_conn(ax, 13.2, 5.0, cases[7][0] + cases[7][2]/2, cases[7][1])
draw_conn(ax, 13.2, 5.0, cases[3][0] + cases[3][2]/2, cases[3][1])
plt.tight_layout()
plt.savefig(os.path.join(IMG_DIR, 'usecase_global.png'), bbox_inches='tight')
plt.close()

# Global Class Diagram (Figure 2.2)
fig, ax = plt.subplots(figsize=(16, 11), dpi=300)
ax.set_xlim(-1, 17)
ax.set_ylim(-1, 12)
ax.axis('off')
draw_class_box(ax, 0.5, 11, 3.8, 3.2, "User", ["+ _id: ObjectId", "+ email: String", "+ passwordHash: String", "+ role: RoleEnum", "+ zoneId: ObjectId", "+ isActive: Boolean"], ["+ validatePassword()", "+ generateTokens()", "+ toJSON()"], '#E8F8F5', '#117864')
draw_class_box(ax, 6.0, 11, 4.2, 3.4, "Zone", ["+ _id: ObjectId", "+ code: String", "+ name: String", "+ geometry: GeoJSONPolygon", "+ totalNroCount: Number", "+ status: ZoneStatus"], ["+ containsPoint()", "+ getBoundingBox()", "+ calculateCapacity()"], '#EBF5FB', '#2980B9')
draw_class_box(ax, 12.0, 11, 4.2, 3.6, "NRO (Noeud Optique)", ["+ _id: ObjectId", "+ code: String", "+ location: GeoJSONPoint", "+ zoneId: ObjectId", "+ maxCapacity: Number", "+ usedPorts: Number", "+ saturationRate: Number"], ["+ isSaturated()", "+ calculateAvailablePorts()", "+ updateMetrics()"], '#FEF9E7', '#B7950B')
draw_class_box(ax, 6.0, 6.5, 4.2, 3.4, "FDT (Sous-Répartiteur)", ["+ _id: ObjectId", "+ code: String", "+ nroId: ObjectId", "+ location: GeoJSONPoint", "+ capacity: Number", "+ connectedClients: Number"], ["+ getOpticalAttenuation()", "+ listActiveLines()"], '#FDF2E9', '#D35400')
draw_class_box(ax, 12.0, 6.5, 4.2, 3.4, "Reclamation / Ticket", ["+ _id: ObjectId", "+ clientContractId: ObjectId", "+ rawDescription: String", "+ category: String (IA)", "+ priority: String (IA)", "+ urgencyScore: Number (IA)", "+ status: TicketStatus"], ["+ applyAiEnrichment()", "+ resolveTicket()", "+ escalate()"], '#FADBD8', '#922B21')
draw_class_box(ax, 0.5, 6.5, 4.0, 3.2, "NetworkEvent", ["+ _id: ObjectId", "+ eventType: String", "+ entityType: String", "+ entityId: ObjectId", "+ severity: SeverityEnum", "+ timestamp: Date"], ["+ publishToRedis()", "+ broadcastSocketIO()"], '#EAECEE', '#2C3E50')
draw_class_box(ax, 6.0, 2.0, 4.2, 2.4, "Contract / Client", ["+ _id: ObjectId", "+ contractNumber: String", "+ clientName: String", "+ fdtId: ObjectId", "+ location: GeoJSONPoint", "+ status: String"], ["+ getLineHistory()"], '#F4ECF7', '#7D3C98')
draw_conn(ax, 4.3, 9.5, 6.0, 9.5, color='#117864', lw=1.8)
ax.text(5.0, 9.7, "1..*  gère  0..1", fontsize=8.5, color='#117864', ha='center')
draw_conn(ax, 10.2, 9.5, 12.0, 9.5, color='#2980B9', lw=1.8)
ax.text(11.1, 9.7, "1  contient  1..*", fontsize=8.5, color='#2980B9', ha='center')
draw_conn(ax, 14.1, 7.4, 10.2, 4.8, color='#B7950B', lw=1.8)
ax.text(12.5, 6.0, "1  alimente  1..*", fontsize=8.5, color='#B7950B', ha='center')
draw_conn(ax, 8.1, 3.1, 8.1, 2.0, color='#D35400', lw=1.8)
ax.text(8.3, 2.5, "1  raccorde  1..*", fontsize=8.5, color='#D35400', ha='left')
draw_conn(ax, 10.2, 1.2, 14.1, 3.1, color='#922B21', lw=1.8)
ax.text(12.5, 2.0, "1  génère  0..*", fontsize=8.5, color='#922B21', ha='center')
plt.tight_layout()
plt.savefig(os.path.join(IMG_DIR, 'class_global.png'), bbox_inches='tight')
plt.close()

# ==============================================================================
# Chapter 3 Diagrams (Figures 3.1 to 3.21)
# ==============================================================================
print("2. Generating Chapter 3 Diagrams...")
# 3.1 Auth usecase
gen_usecase("Raffinement de l'exigence : Authentification", "Utilisateur", 
            ["Saisir Email & Mot de Passe", "Valider Signature JWT & Rôle", "Renouveler Token de Session", "Déconnexion Sécurisée"],
            os.path.join(CH3_DIR, 'auth_usecase.png'))

# 3.2 Auth sequence
gen_sequence("Diagramme de Séquence : Authentification", 
             ["Utilisateur (UI)", "Mobile (Dio/Riverpod)", "NestJS AuthController", "AuthService / JWT", "MongoDB"],
             [(0, 1, "1. Saisie email et mot de passe", True), (1, 2, "2. POST /auth/login {email, password}", True), (2, 3, "3. validateUser(email, password)", True), (3, 4, "4. findOne({email})", True), (4, 3, "5. UserDoc (passwordHash)", False), (3, 3, "6. bcrypt.compare(password, hash)", True), (3, 2, "7. signTokens({sub, role, zoneId})", False), (2, 1, "8. HTTP 200 {accessToken, refreshToken}", False), (1, 1, "9. SecureStorage.save() & State=Auth", True), (1, 0, "10. Redirection Accueil selon Rôle", False)],
             os.path.join(CH3_DIR, 'auth_sequence.png'))

# 3.3 Auth class
gen_classes("Classes liées à l'authentification", [
    {'x': 1.0, 'y': 8.0, 'w': 4.5, 'h': 3.8, 'title': 'UserEntity', 'attrs': ['- id: ObjectId', '- email: string', '- passwordHash: string', '- role: RoleEnum', '- zoneId: ObjectId', '- isActive: boolean'], 'methods': ['+ validatePassword(pwd): boolean', '+ updateRole(role): void'], 'bg': '#E8F8F5', 'ec': '#117864'},
    {'x': 7.5, 'y': 8.0, 'w': 4.5, 'h': 3.2, 'title': 'RoleEnum <<Enumeration>>', 'attrs': ['+ ADMIN = "ADMIN"', '+ RESPONSABLE_ZONE = "RESPONSABLE_ZONE"', '+ TECHNICIEN = "TECHNICIEN"'], 'methods': ['+ hasPermission(perm): boolean'], 'bg': '#FEF9E7', 'ec': '#B7950B'},
    {'x': 7.5, 'y': 3.8, 'w': 4.5, 'h': 3.0, 'title': 'JwtTokenPayload', 'attrs': ['+ sub: string (userId)', '+ email: string', '+ role: RoleEnum', '+ zoneId: string', '+ exp: number'], 'methods': ['+ isExpired(): boolean'], 'bg': '#EBF5FB', 'ec': '#2980B9'}
], os.path.join(CH3_DIR, 'auth_class.png'))

# 3.4 Users global usecase
gen_usecase("Diagramme Global : Gérer les utilisateurs", "Administrateur",
            ["Ajouter un utilisateur", "Modifier un utilisateur", "Désactiver/Supprimer un utilisateur", "Consulter la liste des agents"],
            os.path.join(CH3_DIR, 'users_global_usecase.png'))

# 3.5 User add usecase
gen_usecase("Raffinement : Ajouter un utilisateur", "Administrateur",
            ["Ouvrir formulaire d'inscription", "Renseigner email, rôle et zone", "Enregistrer le compte"],
            os.path.join(CH3_DIR, 'user_add_usecase.png'))

# 3.6 User add sequence
gen_sequence("Séquence : Ajouter un utilisateur", ["Administrateur", "Mobile Client", "NestJS UsersController", "UsersService", "MongoDB"],
             [(0, 1, "1. Saisie des informations", True), (1, 2, "2. POST /users {email, fullName, role, zoneId}", True), (2, 3, "3. createUser(dto)", True), (3, 4, "4. userModel.create(dto)", True), (4, 3, "5. UserDocument persisté", False), (3, 2, "6. UserResponseDto", False), (2, 1, "7. HTTP 201 Created", False), (1, 0, "8. Notification compte créé", False)],
             os.path.join(CH3_DIR, 'user_add_sequence.png'))

# 3.7 User add class
gen_classes("Classes : Ajouter un utilisateur", [
    {'x': 1.0, 'y': 8.0, 'w': 4.5, 'h': 3.5, 'title': 'CreateUserDto', 'attrs': ['+ email: string', '+ fullName: string', '+ role: RoleEnum', '+ zoneId: ObjectId'], 'methods': ['+ validate(): boolean'], 'bg': '#E8F8F5', 'ec': '#117864'},
    {'x': 7.5, 'y': 8.0, 'w': 4.5, 'h': 3.5, 'title': 'UsersService', 'attrs': ['- userModel: Model<UserDoc>', '- configService: ConfigService'], 'methods': ['+ create(dto): Promise<UserDoc>'], 'bg': '#EBF5FB', 'ec': '#2980B9'}
], os.path.join(CH3_DIR, 'user_add_class.png'))

# 3.8 User update usecase
gen_usecase("Raffinement : Modifier un utilisateur", "Administrateur",
            ["Sélectionner un agent", "Modifier les privilèges et zone", "Valider les mises à jour"],
            os.path.join(CH3_DIR, 'user_update_usecase.png'))

# 3.9 User update sequence
gen_sequence("Séquence : Modifier un utilisateur", ["Administrateur", "Mobile Client", "NestJS UsersController", "UsersService", "MongoDB"],
             [(0, 1, "1. Modification des champs", True), (1, 2, "2. PATCH /users/:id {role, zoneId, isActive}", True), (2, 3, "3. updateUser(id, dto)", True), (3, 4, "4. findByIdAndUpdate(id, dto)", True), (4, 3, "5. UserDoc mis à jour", False), (3, 2, "6. UpdatedUserDto", False), (2, 1, "7. HTTP 200 OK", False), (1, 0, "8. Confirmation affichée", False)],
             os.path.join(CH3_DIR, 'user_update_sequence.png'))

# 3.10 User update class
gen_classes("Classes : Modifier un utilisateur", [
    {'x': 1.0, 'y': 8.0, 'w': 4.5, 'h': 3.5, 'title': 'UpdateUserDto', 'attrs': ['+ fullName?: string', '+ role?: RoleEnum', '+ zoneId?: ObjectId', '+ isActive?: boolean'], 'methods': ['+ validate()'], 'bg': '#E8F8F5', 'ec': '#117864'},
    {'x': 7.5, 'y': 8.0, 'w': 4.5, 'h': 3.5, 'title': 'UsersController', 'attrs': ['- usersService: UsersService'], 'methods': ['+ update(@Param() id, @Body() dto)'], 'bg': '#EBF5FB', 'ec': '#2980B9'}
], os.path.join(CH3_DIR, 'user_update_class.png'))

# 3.11 User delete usecase
gen_usecase("Raffinement : Supprimer/Désactiver", "Administrateur",
            ["Sélectionner le compte", "Confirmer la désactivation", "Archiver les accès"],
            os.path.join(CH3_DIR, 'user_delete_usecase.png'))

# 3.12 User delete sequence
gen_sequence("Séquence : Désactiver un utilisateur", ["Administrateur", "Mobile Client", "NestJS UsersController", "UsersService", "MongoDB"],
             [(0, 1, "1. Clic Désactiver compte", True), (1, 2, "2. DELETE /users/:id", True), (2, 3, "3. deactivateUser(id)", True), (3, 4, "4. updateOne({_id: id}, {isActive: false})", True), (4, 3, "5. Acknowledged", False), (3, 2, "6. Status: Inactive", False), (2, 1, "7. HTTP 200 OK", False), (1, 0, "8. Compte désactivé dans la liste", False)],
             os.path.join(CH3_DIR, 'user_delete_sequence.png'))

# 3.13 User delete class
gen_classes("Classes : Désactivation Utilisateur", [
    {'x': 4.0, 'y': 8.0, 'w': 6.0, 'h': 3.5, 'title': 'UserSoftDeleteHandler', 'attrs': ['- userModel: Model<User>', '- auditLogger: Logger'], 'methods': ['+ deactivate(id: ObjectId): Promise<boolean>', '+ reactivate(id: ObjectId): Promise<boolean>'], 'bg': '#FADBD8', 'ec': '#922B21'}
], os.path.join(CH3_DIR, 'user_delete_class.png'))

# 3.14 User view usecase
gen_usecase("Raffinement : Consulter les utilisateurs", "Administrateur",
            ["Afficher la liste des agents", "Filtrer par gouvernorat/rôle", "Consulter les détails du profil"],
            os.path.join(CH3_DIR, 'user_view_usecase.png'))

# 3.15 User view sequence
gen_sequence("Séquence : Consulter les utilisateurs", ["Administrateur", "Mobile Client", "NestJS UsersController", "UsersService", "MongoDB"],
             [(0, 1, "1. Accès au module Utilisateurs", True), (1, 2, "2. GET /users?role=TECHNICIEN&zoneId=...", True), (2, 3, "3. findUsersWithFilters(query)", True), (3, 4, "4. find(filters).populate('zone')", True), (4, 3, "5. UserDoc[] avec Zone details", False), (3, 2, "6. PaginatedUsersDto", False), (2, 1, "7. HTTP 200 JSON", False), (1, 0, "8. Rendu des cartes agents", False)],
             os.path.join(CH3_DIR, 'user_view_sequence.png'))

# 3.16 User view class
gen_classes("Classes : Consultation Utilisateurs", [
    {'x': 1.0, 'y': 8.0, 'w': 4.5, 'h': 3.5, 'title': 'UserFilterQueryDto', 'attrs': ['+ role?: RoleEnum', '+ zoneId?: ObjectId', '+ search?: string', '+ page: number'], 'methods': ['+ buildCriteria(): FilterQuery<User>'], 'bg': '#E8F8F5', 'ec': '#117864'},
    {'x': 7.5, 'y': 8.0, 'w': 5.0, 'h': 3.5, 'title': 'PaginatedUsersResponse', 'attrs': ['+ items: UserSummaryDto[]', '+ totalCount: number', '+ totalPages: number'], 'methods': ['+ hasNext(): boolean'], 'bg': '#EBF5FB', 'ec': '#2980B9'}
], os.path.join(CH3_DIR, 'user_view_class.png'))

# ==============================================================================
# Chapter 4 Diagrams (Figures 4.1 to 4.17)
# ==============================================================================
print("3. Generating Chapter 4 Diagrams...")
# 4.1 Network supervision global usecase
gen_usecase("Diagramme Global : Supervision Réseau", "Superviseur / Technicien",
            ["Consulter la carte réseau multi-couches", "Recevoir les événements temps réel", "Consulter le dashboard KPI", "Gérer les notifications et alertes"],
            os.path.join(CH4_DIR, 'network_supervision_usecase.png'))

# 4.2 Map layers usecase
gen_usecase("Raffinement : Carte réseau multi-couches", "Technicien / Superviseur",
            ["Afficher couches NRO, FDT et Liaisons", "Filtrer les équipements par statut", "Consulter la fiche technique popup"],
            os.path.join(CH4_DIR, 'map_layers_usecase.png'))

# 4.3 Map layers sequence
gen_sequence("Séquence : Chargement Cartographie", ["Technicien (UI)", "flutter_map / Riverpod", "NetworkController", "NetworkService", "MongoDB 2dsphere"],
             [(0, 1, "1. Déplacement/Zoom sur la carte", True), (1, 2, "2. GET /network/features?bbox=...", True), (2, 3, "3. getFeaturesInBoundingBox(bbox)", True), (3, 4, "4. find({location: geoWithin(bbox)})", True), (4, 3, "5. GeoJSON FeatureCollection", False), (3, 2, "6. NetworkGeoJsonDto", False), (2, 1, "7. HTTP 200 OK", False), (1, 0, "8. Rendu des polygones et marqueurs", False)],
             os.path.join(CH4_DIR, 'map_layers_sequence.png'))

# 4.4 Map layers class
gen_classes("Classes : Cartographie & Topologie Réseau", [
    {'x': 1.0, 'y': 8.0, 'w': 4.5, 'h': 3.5, 'title': 'ZoneEntity', 'attrs': ['+ code: string', '+ name: string', '+ geometry: GeoJSONPolygon', '+ totalNroCount: number'], 'methods': ['+ getBoundingBox(): BoundingBox'], 'bg': '#E8F8F5', 'ec': '#117864'},
    {'x': 7.5, 'y': 8.0, 'w': 4.5, 'h': 3.5, 'title': 'NroEntity', 'attrs': ['+ zoneId: ObjectId', '+ code: string', '+ location: GeoJSONPoint', '+ capacity: number'], 'methods': ['+ getFdts(): Promise<Fdt[]>'], 'bg': '#EBF5FB', 'ec': '#2980B9'}
], os.path.join(CH4_DIR, 'map_layers_class.png'))

# 4.5 Realtime usecase
gen_usecase("Raffinement : Recevoir événements temps réel", "Utilisateur Connecté",
            ["Établir connexion WebSocket", "Rejoindre salon régional (Room)", "Recevoir alertes instantanées"],
            os.path.join(CH4_DIR, 'realtime_usecase.png'))

# 4.6 Realtime sequence
gen_sequence("Séquence : Diffusion Événement Temps Réel", ["Sonde Réseau", "NestJS EventGateway", "BullMQ Worker", "Socket.IO Gateway", "Mobile Flutter Client"],
             [(0, 1, "1. Ingestion Alerte Coupure {fdtId, severity: 'CRITICAL'}", True), (1, 2, "2. queue.add('process_alarm')", True), (2, 2, "3. Aggregation & Persistence MongoDB", True), (2, 3, "4. emitToRoom('zone_123', 'network:alert')", True), (3, 4, "5. WS Message 'network:alert' {fdtId, status}", True), (4, 4, "6. Riverpod Provider actualise l'état", True), (4, 4, "7. Marqueur FDT clignote en Rouge", False)],
             os.path.join(CH4_DIR, 'realtime_sequence.png'))

# 4.7 Realtime class
gen_classes("Classes : Moteur Temps Réel", [
    {'x': 1.0, 'y': 8.0, 'w': 4.5, 'h': 3.5, 'title': 'RealtimeGateway', 'attrs': ['- server: Server', '- jwtService: JwtService'], 'methods': ['+ handleConnection(client)', '+ emitToZone(zoneId, event, payload)'], 'bg': '#EBF5FB', 'ec': '#2980B9'},
    {'x': 7.5, 'y': 8.0, 'w': 5.0, 'h': 3.5, 'title': 'NetworkEventPayload', 'attrs': ['+ eventId: string', '+ entityType: "NRO"|"FDT"', '+ entityId: string', '+ severity: "CRITICAL"|"WARN"'], 'methods': ['+ serialize(): string'], 'bg': '#FEF9E7', 'ec': '#B7950B'}
], os.path.join(CH4_DIR, 'realtime_class.png'))

# 4.8 Dashboard usecase
gen_usecase("Raffinement : Consulter le dashboard KPI", "Superviseur / Admin",
            ["Consulter disponibilité réseau", "Visualiser statistiques régionales", "Analyser temps de réparation MTTR"],
            os.path.join(CH4_DIR, 'dashboard_usecase.png'))

# 4.9 Dashboard sequence
gen_sequence("Séquence : Calcul du Dashboard KPI", ["Superviseur", "Flutter UI", "AnalyticsController", "MetricsService", "MongoDB"],
             [(0, 1, "1. Ouverture Dashboard", True), (1, 2, "2. GET /analytics/kpis/overview", True), (2, 3, "3. computeOperationalKpis()", True), (3, 4, "4. aggregate([{match}, {group}])", True), (4, 3, "5. Résultat agrégation", False), (3, 2, "6. DashboardOverviewDto", False), (2, 1, "7. HTTP 200 JSON", False), (1, 0, "8. Rendu graphiques fl_chart", False)],
             os.path.join(CH4_DIR, 'dashboard_sequence.png'))

# 4.10 Dashboard class
gen_classes("Classes : Métriques Dashboard", [
    {'x': 3.5, 'y': 8.0, 'w': 6.5, 'h': 3.5, 'title': 'DashboardKpiDto', 'attrs': ['+ networkAvailability: number', '+ activeIncidentsCount: number', '+ regionalStats: Record<string, number>', '+ mttrMinutes: number'], 'methods': ['+ getHealthIndex(): number'], 'bg': '#E8F8F5', 'ec': '#117864'}
], os.path.join(CH4_DIR, 'dashboard_class.png'))

# 4.11 Notifications usecase
gen_usecase("Raffinement : Gérer les notifications", "Superviseur / Technicien",
            ["Recevoir notification push", "Filtrer la liste des alertes", "Acquitter / Marquer comme lu"],
            os.path.join(CH4_DIR, 'notifications_usecase.png'))

# 4.12 Notifications sequence
gen_sequence("Séquence : Notifications d'Alertes", ["Technicien", "Flutter App", "NotifController", "NotifService", "MongoDB"],
             [(0, 1, "1. Consultation centre d'alertes", True), (1, 2, "2. GET /notifications", True), (2, 3, "3. findUserNotifications(userId)", True), (3, 4, "4. find({recipientZone: zoneId})", True), (4, 3, "5. NotificationDocument[]", False), (3, 2, "6. NotificationDto[]", False), (2, 1, "7. HTTP 200 JSON", False), (1, 0, "8. Affichage liste triée par urgence", False)],
             os.path.join(CH4_DIR, 'notifications_sequence.png'))

# 4.13 Notifications class
gen_classes("Classes : Gestion des Notifications", [
    {'x': 3.5, 'y': 8.0, 'w': 6.5, 'h': 3.5, 'title': 'NotificationEntity', 'attrs': ['+ id: ObjectId', '+ title: string', '+ message: string', '+ severity: SeverityEnum', '+ isRead: boolean', '+ createdAt: Date'], 'methods': ['+ markAsRead(): void'], 'bg': '#FADBD8', 'ec': '#922B21'}
], os.path.join(CH4_DIR, 'notifications_class.png'))

# ==============================================================================
# Chapter 5 Diagrams (Figures 5.1 to 5.17)
# ==============================================================================
print("4. Generating Chapter 5 Diagrams...")
# 5.1 Release 3 global usecase
gen_usecase("Diagramme Global : Release 3 (IA & Validation)", "Superviseur / DevOps",
            ["Enrichir les réclamations via Groq LLM", "Prédire la saturation des NRO", "Exécuter les tests de non-régression", "Déployer la solution conteneurisée"],
            os.path.join(CH5_DIR, 'release3_global_usecase.png'))

# 5.2 AI reclamations usecase
gen_usecase("Raffinement : IA Réclamations", "Superviseur",
            ["Ingérer le texte brut de la réclamation", "Extraire la catégorie de panne (NLP)", "Calculer score d'urgence et recommandation"],
            os.path.join(CH5_DIR, 'ai_reclamations_usecase.png'))

# 5.3 AI reclamations sequence
gen_sequence("Séquence : IA Réclamations avec Circuit Breaker", ["ReclamationService", "GroqService (Circuit Breaker)", "PriorityQueue (Token Bucket)", "Groq LPU Cloud (LLaMA-3)", "Deterministic Fallback"],
             [(0, 1, "1. enrichReclamation(rawText, priority='high')", True), (1, 1, "2. Check CircuitState (CLOSED / OPEN)", True), (1, 2, "3. enqueueTask(priority, runFn)", True), (2, 3, "4. POST /chat/completions (response_format: json)", True), (3, 2, "5. HTTP 200 JSON {category, urgency, recommendation}", False), (2, 1, "6. Parse & Validate Structure JSON", False), (1, 0, "7. Return EnrichedPayload {source: 'groq'}", False), (1, 4, "Alt: Si Timeout/429 -> Exécution Fallback heuristique", True), (4, 0, "Alt: Return EnrichedPayload {source: 'deterministic'}", False)],
             os.path.join(CH5_DIR, 'ai_reclamations_sequence.png'))

# 5.4 AI reclamations class
gen_classes("Classes : Module IA Réclamations", [
    {'x': 1.0, 'y': 8.0, 'w': 4.8, 'h': 3.5, 'title': 'GroqService', 'attrs': ['- circuitState: CircuitState', '- priorityQueue: PriorityQueue'], 'methods': ['+ chatJSON<T>(prompt): Promise<T>', '+ fallbackHeuristic(text): Result'], 'bg': '#FEF9E7', 'ec': '#B7950B'},
    {'x': 7.5, 'y': 8.0, 'w': 5.2, 'h': 3.5, 'title': 'EnrichedReclamationDto', 'attrs': ['+ category: string', '+ urgencyScore: number', '+ priority: string', '+ recommendation: string', '+ source: "groq"|"deterministic"'], 'methods': ['+ isCritical(): boolean'], 'bg': '#E8F8F5', 'ec': '#117864'}
], os.path.join(CH5_DIR, 'ai_reclamations_class.png'))

# 5.5 AI saturation usecase
gen_usecase("Raffinement : IA Saturation NRO", "Décideur Réseau",
            ["Calculer le ratio d'occupation des ports", "Détecter les NRO au-dessus du seuil 85%", "Générer alertes prévisionnelles d'extension"],
            os.path.join(CH5_DIR, 'ai_saturation_usecase.png'))

# 5.6 AI saturation sequence
gen_sequence("Séquence : Détection Saturation NRO", ["Cron Job / Décideur", "NroService", "CapacityEvaluator", "MongoDB", "Socket.IO Gateway"],
             [(0, 1, "1. Déclenchement calcul périodique", True), (1, 3, "2. findAllWithPortsCount()", True), (3, 1, "3. NroDocuments[]", False), (1, 2, "4. evaluateSaturation(ports, maxCapacity)", True), (2, 1, "5. SaturationRate > 85% (Critique)", False), (1, 4, "6. emit('nro:saturation_alert', nroId)", True), (4, 0, "7. Notification préventive diffusée", False)],
             os.path.join(CH5_DIR, 'ai_saturation_sequence.png'))

# 5.7 AI saturation class
gen_classes("Classes : Prévision Saturation NRO", [
    {'x': 3.5, 'y': 8.0, 'w': 6.5, 'h': 3.5, 'title': 'NroSaturationMetrics', 'attrs': ['+ nroId: ObjectId', '+ totalPorts: number', '+ usedPorts: number', '+ saturationRate: number', '+ riskLevel: "LOW"|"HIGH"|"CRITICAL"'], 'methods': ['+ isAlertTriggered(): boolean'], 'bg': '#FEF9E7', 'ec': '#B7950B'}
], os.path.join(CH5_DIR, 'ai_saturation_class.png'))

# 5.8 Integration tests usecase
gen_usecase("Raffinement : Intégration et tests", "Équipe QA / Développeurs",
            ["Exécuter tests unitaires Jest", "Valider les flux API Supertest", "Vérifier la non-régression inter-modules"],
            os.path.join(CH5_DIR, 'integration_tests_usecase.png'))

# 5.9 Integration tests sequence
gen_sequence("Séquence : Exécution des Tests d'Intégration", ["GitHub Actions / QA", "Jest Test Runner", "Test Module NestJS", "MongoDB In-Memory"],
             [(0, 1, "1. npm run test:e2e", True), (1, 2, "2. Initialize TestModule & Guards", True), (2, 3, "3. Connect in-memory MongoDB", True), (3, 2, "4. Database Connected", False), (2, 1, "5. Run Test Suites (Auth, Network, AI)", False), (1, 0, "6. Test Summary: 100% Passed", False)],
             os.path.join(CH5_DIR, 'integration_tests_sequence.png'))

# 5.10 Integration tests class
gen_classes("Classes : Suite de Tests d'Intégration", [
    {'x': 3.5, 'y': 8.0, 'w': 6.5, 'h': 3.5, 'title': 'IntegrationTestSuite', 'attrs': ['- app: INestApplication', '- mongoConnection: Connection'], 'methods': ['+ setupTestBed(): Promise<void>', '+ teardown(): Promise<void>', '+ testAuthFlow(): Promise<void>'], 'bg': '#EBF5FB', 'ec': '#2980B9'}
], os.path.join(CH5_DIR, 'integration_tests_class.png'))

# 5.11 Deployment docs usecase
gen_usecase("Raffinement : Déploiement et documentation", "DevOps / Exploitant",
            ["Générer image conteneurisée Docker", "Déployer sur cluster Cloud", "Rédiger guides d'exploitation"],
            os.path.join(CH5_DIR, 'deployment_docs_usecase.png'))

# 5.12 Deployment docs sequence
gen_sequence("Séquence : Déploiement Continu CI/CD", ["Développeur", "GitHub Repo", "CI/CD Pipeline", "Docker Registry", "Cloud Cluster"],
             [(0, 1, "1. git push origin main", True), (1, 2, "2. Trigger Build & Tests", True), (2, 3, "3. Build & Push Docker Image", True), (3, 4, "4. Deploy Container to Cloud", True), (4, 2, "5. Healthcheck OK (HTTP 200)", False), (2, 0, "6. Notification Déploiement Réussi", False)],
             os.path.join(CH5_DIR, 'deployment_docs_sequence.png'))

# 5.13 Deployment docs class
gen_classes("Classes : Configuration Déploiement", [
    {'x': 3.5, 'y': 8.0, 'w': 6.5, 'h': 3.5, 'title': 'AppConfigService', 'attrs': ['+ PORT: number', '+ MONGO_URI: string', '+ REDIS_HOST: string', '+ GROQ_API_KEY: string', '+ JWT_SECRET: string'], 'methods': ['+ validateEnv(): void'], 'bg': '#E8F8F5', 'ec': '#117864'}
], os.path.join(CH5_DIR, 'deployment_docs_class.png'))

print("All diagrams generated successfully.")
