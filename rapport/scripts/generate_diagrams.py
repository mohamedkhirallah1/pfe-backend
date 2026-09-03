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

# Colors
PRIMARY = '#1A5276'
SECONDARY = '#2980B9'
ACCENT = '#C0392B'
BG_LIGHT = '#F8F9FA'
BOX_BG = '#EBF5FB'
BORDER = '#2C3E50'
TEXT_DARK = '#1C2833'
GREEN_SUCCESS = '#27AE60'
ORANGE_WARN = '#E67E22'
GRAY_LIGHT = '#EAEDED'

def draw_actor(ax, x, y, name, color='#2C3E50'):
    circle = plt.Circle((x, y + 0.35), 0.12, fill=True, color='#EBF5FB', ec=color, lw=1.8, zorder=4)
    ax.add_patch(circle)
    ax.plot([x, x], [y + 0.23, y - 0.15], color=color, lw=2, zorder=4)
    ax.plot([x - 0.22, x + 0.22], [y + 0.1, y + 0.1], color=color, lw=2, zorder=4)
    ax.plot([x, x - 0.18], [y - 0.15, y - 0.45], color=color, lw=2, zorder=4)
    ax.plot([x, x + 0.18], [y - 0.15, y - 0.45], color=color, lw=2, zorder=4)
    ax.text(x, y - 0.65, name, ha='center', va='top', fontsize=9.5, fontweight='bold', color=TEXT_DARK, zorder=5)

def draw_usecase(ax, x, y, w, h, text, color='#EBF5FB', ec='#2980B9'):
    ellipse = patches.Ellipse((x, y), w, h, facecolor=color, edgecolor=ec, lw=1.8, zorder=3)
    ax.add_patch(ellipse)
    ax.text(x, y, text, ha='center', va='center', fontsize=9, color=TEXT_DARK, fontweight='semibold', zorder=5, multialignment='center')

def draw_conn(ax, x1, y1, x2, y2, color='#7F8C8D', style='-', lw=1.4):
    ax.plot([x1, x2], [y1, y2], color=color, linestyle=style, lw=lw, zorder=2)

def draw_class_box(ax, x, y, w, h, title, attributes, methods, color='#FEF9E7', ec='#B7950B'):
    box = patches.FancyBboxPatch((x, y - h), w, h, boxstyle="round,pad=0.03", facecolor=color, edgecolor=ec, lw=1.6, zorder=3)
    ax.add_patch(box)
    header_h = 0.5
    header = patches.FancyBboxPatch((x, y - header_h), w, header_h, boxstyle="round,pad=0.03", facecolor=ec, edgecolor=ec, lw=1.6, zorder=3)
    ax.add_patch(header)
    ax.text(x + w/2, y - header_h/2, title, ha='center', va='center', fontsize=10, fontweight='bold', color='white', zorder=5)
    
    # Attributes
    curr_y = y - header_h - 0.2
    for attr in attributes:
        ax.text(x + 0.1, curr_y, attr, ha='left', va='center', fontsize=8.5, color=TEXT_DARK, zorder=5)
        curr_y -= 0.25
        
    # Line
    ax.plot([x, x + w], [curr_y + 0.1, curr_y + 0.1], color=ec, lw=1, zorder=4)
    curr_y -= 0.15
    # Methods
    for m in methods:
        ax.text(x + 0.1, curr_y, m, ha='left', va='center', fontsize=8.5, color='#1A5276', zorder=5)
        curr_y -= 0.25

# ==============================================================================
# 1. Global Use Case Diagram (usecase_global.png)
# ==============================================================================
def gen_usecase_global():
    fig, ax = plt.subplots(figsize=(14, 9.5), dpi=300)
    ax.set_xlim(-1, 15)
    ax.set_ylim(-1, 11)
    ax.axis('off')
    
    # System boundary
    rect = patches.FancyBboxPatch((3.2, 0.2), 8.6, 10.2, boxstyle="round,pad=0.1", facecolor='#FDFEFE', edgecolor=PRIMARY, lw=2.2, zorder=1)
    ax.add_patch(rect)
    ax.text(7.5, 10.0, "Plateforme Smart Fiber Supervision", ha='center', va='center', fontsize=14, fontweight='bold', color=PRIMARY, zorder=5)
    
    # Actors
    draw_actor(ax, 1.2, 8.5, "Administrateur\n(National)")
    draw_actor(ax, 1.2, 4.8, "Responsable de Zone\n(Régional)")
    draw_actor(ax, 1.2, 1.6, "Technicien\n(Terrain)")
    draw_actor(ax, 13.5, 5.0, "Système Externe\n(Événements/Sondes)")
    
    # Use cases
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
        
    # Connections Admin
    for idx in [0, 1, 2, 3, 4, 5, 6]:
        draw_conn(ax, 1.5, 8.5, cases[idx][0] - cases[idx][2]/2, cases[idx][1])
        
    # Connections Responsable Zone
    for idx in [0, 2, 3, 4, 5]:
        draw_conn(ax, 1.5, 4.8, cases[idx][0] - cases[idx][2]/2, cases[idx][1])
        
    # Connections Technicien
    for idx in [0, 2, 3]:
        draw_conn(ax, 1.5, 1.6, cases[idx][0] - cases[idx][2]/2, cases[idx][1])
        
    # Connection Système externe
    draw_conn(ax, 13.2, 5.0, cases[7][0] + cases[7][2]/2, cases[7][1])
    draw_conn(ax, 13.2, 5.0, cases[3][0] + cases[3][2]/2, cases[3][1])
    
    plt.tight_layout()
    plt.savefig(os.path.join(IMG_DIR, 'usecase_global.png'), bbox_inches='tight')
    plt.close()
    print("Generated usecase_global.png")

# ==============================================================================
# 2. Global Class Diagram (class_global.png)
# ==============================================================================
def gen_class_global():
    fig, ax = plt.subplots(figsize=(16, 11), dpi=300)
    ax.set_xlim(-1, 17)
    ax.set_ylim(-1, 12)
    ax.axis('off')
    
    draw_class_box(ax, 0.5, 11, 3.8, 3.2, "User", 
                   ["+ _id: ObjectId", "+ email: String", "+ passwordHash: String", "+ role: RoleEnum", "+ zoneId: ObjectId", "+ isActive: Boolean"],
                   ["+ validatePassword()", "+ generateTokens()", "+ toJSON()"], '#E8F8F5', '#117864')
                   
    draw_class_box(ax, 6.0, 11, 4.2, 3.4, "Zone", 
                   ["+ _id: ObjectId", "+ code: String", "+ name: String", "+ geometry: GeoJSONPolygon", "+ totalNroCount: Number", "+ status: ZoneStatus"],
                   ["+ containsPoint()", "+ getBoundingBox()", "+ calculateCapacity()"], '#EBF5FB', '#2980B9')

    draw_class_box(ax, 12.0, 11, 4.2, 3.6, "NRO (Noeud Optique)", 
                   ["+ _id: ObjectId", "+ code: String", "+ location: GeoJSONPoint", "+ zoneId: ObjectId", "+ maxCapacity: Number", "+ usedPorts: Number", "+ saturationRate: Number"],
                   ["+ isSaturated()", "+ calculateAvailablePorts()", "+ updateMetrics()"], '#FEF9E7', '#B7950B')

    draw_class_box(ax, 6.0, 6.5, 4.2, 3.4, "FDT (Sous-Répartiteur)", 
                   ["+ _id: ObjectId", "+ code: String", "+ nroId: ObjectId", "+ location: GeoJSONPoint", "+ capacity: Number", "+ connectedClients: Number"],
                   ["+ getOpticalAttenuation()", "+ listActiveLines()"], '#FDF2E9', '#D35400')

    draw_class_box(ax, 12.0, 6.5, 4.2, 3.4, "Reclamation / Ticket", 
                   ["+ _id: ObjectId", "+ clientContractId: ObjectId", "+ rawDescription: String", "+ category: String (IA)", "+ priority: String (IA)", "+ urgencyScore: Number (IA)", "+ status: TicketStatus"],
                   ["+ applyAiEnrichment()", "+ resolveTicket()", "+ escalate()"], '#FADBD8', '#922B21')

    draw_class_box(ax, 0.5, 6.5, 4.0, 3.2, "NetworkEvent", 
                   ["+ _id: ObjectId", "+ eventType: String", "+ entityType: String", "+ entityId: ObjectId", "+ severity: SeverityEnum", "+ timestamp: Date"],
                   ["+ publishToRedis()", "+ broadcastSocketIO()"], '#EAECEE', '#2C3E50')

    draw_class_box(ax, 6.0, 2.0, 4.2, 2.4, "Contract / Client", 
                   ["+ _id: ObjectId", "+ contractNumber: String", "+ clientName: String", "+ fdtId: ObjectId", "+ location: GeoJSONPoint", "+ status: String"],
                   ["+ getLineHistory()"], '#F4ECF7', '#7D3C98')

    # Relationships
    # User -> Zone
    draw_conn(ax, 4.3, 9.5, 6.0, 9.5, color='#117864', lw=1.8)
    ax.text(5.0, 9.7, "1..*  gère  0..1", fontsize=8.5, color='#117864', ha='center')
    
    # Zone -> NRO
    draw_conn(ax, 10.2, 9.5, 12.0, 9.5, color='#2980B9', lw=1.8)
    ax.text(11.1, 9.7, "1  contient  1..*", fontsize=8.5, color='#2980B9', ha='center')
    
    # NRO -> FDT
    draw_conn(ax, 14.1, 7.4, 10.2, 4.8, color='#B7950B', lw=1.8)
    ax.text(12.5, 6.0, "1  alimente  1..*", fontsize=8.5, color='#B7950B', ha='center')

    # FDT -> Contract
    draw_conn(ax, 8.1, 3.1, 8.1, 2.0, color='#D35400', lw=1.8)
    ax.text(8.3, 2.5, "1  raccorde  1..*", fontsize=8.5, color='#D35400', ha='left')

    # Contract -> Reclamation
    draw_conn(ax, 10.2, 1.2, 14.1, 3.1, color='#922B21', lw=1.8)
    ax.text(12.5, 2.0, "1  génère  0..*", fontsize=8.5, color='#922B21', ha='center')
    
    plt.tight_layout()
    plt.savefig(os.path.join(IMG_DIR, 'class_global.png'), bbox_inches='tight')
    plt.close()
    print("Generated class_global.png")

# ==============================================================================
# 3. Chapter 3: Auth & User Diagrams
# ==============================================================================
def gen_ch3_diagrams():
    # 3.1 Auth Use Case
    fig, ax = plt.subplots(figsize=(10, 6), dpi=300)
    ax.set_xlim(-1, 11)
    ax.set_ylim(-1, 7)
    ax.axis('off')
    
    rect = patches.FancyBboxPatch((3.0, 0.2), 6.5, 6.4, boxstyle="round,pad=0.1", facecolor='#FDFEFE', edgecolor=PRIMARY, lw=2)
    ax.add_patch(rect)
    ax.text(6.25, 6.1, "Module Authentification & Sécurité", ha='center', fontsize=12, fontweight='bold', color=PRIMARY)
    
    draw_actor(ax, 1.2, 3.5, "Utilisateur\n(Tout Rôle)")
    
    cases = [
        (6.25, 4.8, 4.0, 0.8, "Saisir Identifiants"),
        (6.25, 3.5, 4.4, 0.8, "Valider Tokens JWT & Rôles"),
        (6.25, 2.2, 4.0, 0.8, "Renouveler Access Token"),
        (6.25, 0.9, 4.0, 0.8, "Se déconnecter")
    ]
    for x, y, w, h, t in cases:
        draw_usecase(ax, x, y, w, h, t)
        draw_conn(ax, 1.5, 3.5, x - w/2, y)
        
    plt.tight_layout()
    plt.savefig(os.path.join(CH3_DIR, 'auth_usecase.png'), bbox_inches='tight')
    plt.close()
    
    # 3.2 Auth Sequence Diagram
    fig, ax = plt.subplots(figsize=(14, 8.5), dpi=300)
    ax.set_xlim(0, 14)
    ax.set_ylim(0, 10)
    ax.axis('off')
    
    lifelines = [
        (1.5, "Utilisateur (UI)"),
        (4.5, "Mobile (Dio/Riverpod)"),
        (7.5, "NestJS AuthController"),
        (10.5, "AuthService / JWT"),
        (13.0, "MongoDB")
    ]
    
    for x, name in lifelines:
        box = patches.FancyBboxPatch((x - 1.2, 9.0), 2.4, 0.7, boxstyle="round,pad=0.02", facecolor='#EBF5FB', edgecolor=PRIMARY, lw=1.5)
        ax.add_patch(box)
        ax.text(x, 9.35, name, ha='center', va='center', fontsize=9, fontweight='bold', color=PRIMARY)
        ax.plot([x, x], [0.5, 9.0], color='#BDC3C7', linestyle='--', lw=1.5)
        
    messages = [
        (1.5, 4.5, 8.2, "1. Saisie email / mot de passe", True),
        (4.5, 7.5, 7.4, "2. POST /auth/login {email, pwd}", True),
        (7.5, 10.5, 6.6, "3. validateUser(email, pwd)", True),
        (10.5, 13.0, 5.8, "4. findOne({email})", True),
        (13.0, 10.5, 5.0, "5. Retourne UserDoc (passwordHash)", False),
        (10.5, 10.5, 4.2, "6. bcrypt.compare(pwd, hash)", False),
        (10.5, 7.5, 3.4, "7. signToken({sub, role, zoneId})", False),
        (7.5, 4.5, 2.6, "8. HTTP 200 {accessToken, refreshToken, user}", False),
        (4.5, 4.5, 1.8, "9. SecureStorage.save() & State=Authenticated", False),
        (4.5, 1.5, 1.0, "10. Navigation Dashboard autorisé", False)
    ]
    
    for x1, x2, y, text, forward in messages:
        if x1 == x2:
            ax.plot([x1, x1 + 0.8, x1 + 0.8, x1], [y + 0.2, y + 0.2, y - 0.2, y - 0.2], color=PRIMARY, lw=1.4)
            ax.text(x1 + 0.9, y, text, fontsize=8.5, va='center', color=TEXT_DARK)
        else:
            style = '->' if forward else '<--'
            ax.annotate('', xy=(x2, y), xytext=(x1, y), arrowprops=dict(arrowstyle="->", color=ACCENT if not forward else PRIMARY, lw=1.4))
            ax.text((x1 + x2)/2, y + 0.15, text, fontsize=8.5, ha='center', color=TEXT_DARK)
            
    plt.tight_layout()
    plt.savefig(os.path.join(CH3_DIR, 'auth_sequence.png'), bbox_inches='tight')
    plt.close()
    
    # 3.3 Users Global Use Case
    fig, ax = plt.subplots(figsize=(10, 6.5), dpi=300)
    ax.set_xlim(-1, 11)
    ax.set_ylim(-1, 7.5)
    ax.axis('off')
    
    rect = patches.FancyBboxPatch((3.0, 0.2), 6.8, 7.0, boxstyle="round,pad=0.1", facecolor='#FDFEFE', edgecolor=PRIMARY, lw=2)
    ax.add_patch(rect)
    ax.text(6.4, 6.7, "Module Gestion des Utilisateurs", ha='center', fontsize=12, fontweight='bold', color=PRIMARY)
    
    draw_actor(ax, 1.2, 4.0, "Administrateur")
    
    u_cases = [
        (6.4, 5.4, 4.6, 0.8, "Créer un nouveau compte utilisateur"),
        (6.4, 4.1, 4.6, 0.8, "Modifier le profil & rôle (RBAC)"),
        (6.4, 2.8, 4.6, 0.8, "Affecter à une zone géographique"),
        (6.4, 1.5, 4.6, 0.8, "Désactiver / Supprimer un compte"),
        (6.4, 0.5, 4.6, 0.7, "Consulter & Filtrer la liste des agents")
    ]
    for x, y, w, h, t in u_cases:
        draw_usecase(ax, x, y, w, h, t)
        draw_conn(ax, 1.5, 4.0, x - w/2, y)
        
    plt.tight_layout()
    plt.savefig(os.path.join(CH3_DIR, 'users_global_usecase.png'), bbox_inches='tight')
    plt.close()
    
    # 3.4 Auth & User Class Diagram
    fig, ax = plt.subplots(figsize=(12, 7), dpi=300)
    ax.set_xlim(0, 14)
    ax.set_ylim(0, 8)
    ax.axis('off')
    
    draw_class_box(ax, 1.0, 7.5, 4.5, 3.8, "UserEntity",
                   ["- id: ObjectId", "- email: string", "- passwordHash: string", "- fullName: string", "- role: RoleEnum", "- zoneId: ObjectId", "- isActive: boolean"],
                   ["+ validatePassword(pwd): boolean", "+ updateRole(role): void", "+ setZone(zoneId): void"], '#E8F8F5', '#117864')
                   
    draw_class_box(ax, 7.5, 7.5, 4.5, 3.2, "RoleEnum <<Enumeration>>",
                   ["+ ADMIN = 'ADMIN'", "+ RESPONSABLE_ZONE = 'RESPONSABLE_ZONE'", "+ TECHNICIEN = 'TECHNICIEN'"],
                   ["+ hasPermission(p): boolean"], '#FEF9E7', '#B7950B')

    draw_class_box(ax, 7.5, 3.5, 4.5, 3.0, "JwtTokenPayload",
                   ["+ sub: string (userId)", "+ email: string", "+ role: RoleEnum", "+ zoneId: string", "+ iat: number", "+ exp: number"],
                   ["+ isExpired(): boolean"], '#EBF5FB', '#2980B9')
                   
    draw_conn(ax, 5.5, 5.8, 7.5, 5.8, color='#117864', lw=1.6)
    ax.text(6.5, 6.0, "1  a pour rôle  1", fontsize=9, color='#117864', ha='center')
    
    draw_conn(ax, 3.25, 3.7, 7.5, 2.0, color='#2980B9', lw=1.6)
    ax.text(5.3, 2.6, "génère payload", fontsize=9, color='#2980B9', ha='center')

    plt.tight_layout()
    plt.savefig(os.path.join(CH3_DIR, 'auth_class.png'), bbox_inches='tight')
    plt.close()
    print("Generated Chapter 3 diagrams")

# ==============================================================================
# 4. Chapter 4: Network Supervision & Real-Time Diagrams
# ==============================================================================
def gen_ch4_diagrams():
    # 4.1 Network Supervision Use Case
    fig, ax = plt.subplots(figsize=(12, 7.5), dpi=300)
    ax.set_xlim(-1, 13)
    ax.set_ylim(-1, 8.5)
    ax.axis('off')
    
    rect = patches.FancyBboxPatch((3.2, 0.2), 7.2, 8.0, boxstyle="round,pad=0.1", facecolor='#FDFEFE', edgecolor=PRIMARY, lw=2)
    ax.add_patch(rect)
    ax.text(6.8, 7.7, "Supervision Réseau & Cartographie", ha='center', fontsize=12, fontweight='bold', color=PRIMARY)
    
    draw_actor(ax, 1.2, 5.5, "Superviseur /\nAdmin")
    draw_actor(ax, 1.2, 1.8, "Technicien\nTerrain")
    
    cases = [
        (6.8, 6.6, 5.2, 0.85, "Afficher la carte multi-couches"),
        (6.8, 5.3, 5.2, 0.85, "Filtrer par Zone / Statut / NRO"),
        (6.8, 4.0, 5.2, 0.85, "Recevoir les alertes pannes temps réel"),
        (6.8, 2.7, 5.2, 0.85, "Consulter la fiche détaillée d'un FDT/NRO"),
        (6.8, 1.4, 5.2, 0.85, "Consulter le Dashboard KPI & Statistiques")
    ]
    for x, y, w, h, t in cases:
        draw_usecase(ax, x, y, w, h, t)
        draw_conn(ax, 1.5, 5.5, x - w/2, y)
        if y >= 2.0:
            draw_conn(ax, 1.5, 1.8, x - w/2, y)
            
    plt.tight_layout()
    plt.savefig(os.path.join(CH4_DIR, 'network_supervision_usecase.png'), bbox_inches='tight')
    plt.close()
    
    # 4.2 Real-time Sequence Diagram
    fig, ax = plt.subplots(figsize=(14, 8.5), dpi=300)
    ax.set_xlim(0, 14)
    ax.set_ylim(0, 10)
    ax.axis('off')
    
    lifelines = [
        (1.5, "Sonde / Capteur"),
        (4.2, "NestJS EventController"),
        (7.2, "BullMQ Queue / Redis"),
        (10.2, "Socket.IO Gateway"),
        (13.0, "Mobile Flutter Client")
    ]
    
    for x, name in lifelines:
        box = patches.FancyBboxPatch((x - 1.2, 9.0), 2.4, 0.7, boxstyle="round,pad=0.02", facecolor='#EBF5FB', edgecolor=PRIMARY, lw=1.5)
        ax.add_patch(box)
        ax.text(x, 9.35, name, ha='center', va='center', fontsize=8.5, fontweight='bold', color=PRIMARY)
        ax.plot([x, x], [0.5, 9.0], color='#BDC3C7', linestyle='--', lw=1.5)
        
    messages = [
        (1.5, 4.2, 8.0, "1. POST /events {nroId, status: 'CRITICAL'}", True),
        (4.2, 7.2, 7.2, "2. eventQueue.add('process_incident')", True),
        (4.2, 1.5, 6.4, "3. HTTP 202 Accepted", False),
        (7.2, 7.2, 5.6, "4. Worker: Sauvegarde MongoDB & Aggregation", False),
        (7.2, 10.2, 4.8, "5. socketGateway.emitToRoom('zone_123')", True),
        (10.2, 13.0, 3.8, "6. WS Event 'incident:new' {nroId, severity}", True),
        (13.0, 13.0, 2.8, "7. Riverpod Provider actualise l'état en mémoire", False),
        (13.0, 13.0, 1.8, "8. Re-render du marqueur NRO (Rouge clignotant)", False),
        (13.0, 13.0, 0.8, "9. Notification Push locale affichée", False)
    ]
    
    for x1, x2, y, text, forward in messages:
        if x1 == x2:
            ax.plot([x1, x1 + 0.8, x1 + 0.8, x1], [y + 0.2, y + 0.2, y - 0.2, y - 0.2], color=PRIMARY, lw=1.4)
            ax.text(x1 + 0.9, y, text, fontsize=8.5, va='center', color=TEXT_DARK)
        else:
            style = '->' if forward else '<--'
            ax.annotate('', xy=(x2, y), xytext=(x1, y), arrowprops=dict(arrowstyle="->", color=ACCENT if not forward else PRIMARY, lw=1.4))
            ax.text((x1 + x2)/2, y + 0.15, text, fontsize=8.5, ha='center', color=TEXT_DARK)

    plt.tight_layout()
    plt.savefig(os.path.join(CH4_DIR, 'realtime_sequence.png'), bbox_inches='tight')
    plt.close()
    
    # 4.3 Network & Map Layers Class Diagram
    fig, ax = plt.subplots(figsize=(14, 8), dpi=300)
    ax.set_xlim(0, 15)
    ax.set_ylim(0, 9)
    ax.axis('off')
    
    draw_class_box(ax, 0.8, 8.5, 4.2, 3.4, "ZoneEntity",
                   ["+ id: ObjectId", "+ code: string", "+ name: string", "+ geometry: GeoJSONPolygon", "+ activeAlertsCount: number"],
                   ["+ calculateHealth(): number", "+ toGeoJSON(): Feature"], '#E8F8F5', '#117864')
                   
    draw_class_box(ax, 5.8, 8.5, 4.2, 3.4, "NroEntity",
                   ["+ id: ObjectId", "+ zoneId: ObjectId", "+ code: string", "+ location: GeoJSONPoint", "+ capacity: number", "+ status: OperationalStatus"],
                   ["+ getConnectedFdts(): Fdt[]", "+ getSaturationIndex(): number"], '#EBF5FB', '#2980B9')

    draw_class_box(ax, 10.8, 8.5, 3.8, 3.4, "FdtEntity",
                   ["+ id: ObjectId", "+ nroId: ObjectId", "+ code: string", "+ location: GeoJSONPoint", "+ fiberCapacity: number", "+ connectedClients: number"],
                   ["+ getLineLoad(): number"], '#FEF9E7', '#B7950B')

    draw_class_box(ax, 5.8, 4.2, 4.2, 3.2, "NetworkIncidentEvent",
                   ["+ id: ObjectId", "+ entityType: 'NRO' | 'FDT'", "+ entityId: ObjectId", "+ severity: SeverityLevel", "+ message: string", "+ timestamp: Date"],
                   ["+ broadcast(): void", "+ acknowledge(userId): void"], '#FADBD8', '#922B21')

    # Links
    draw_conn(ax, 5.0, 6.8, 5.8, 6.8, color='#117864', lw=1.6)
    ax.text(5.4, 7.0, "1..*", fontsize=9, color='#117864', ha='center')
    
    draw_conn(ax, 10.0, 6.8, 10.8, 6.8, color='#2980B9', lw=1.6)
    ax.text(10.4, 7.0, "1..*", fontsize=9, color='#2980B9', ha='center')
    
    draw_conn(ax, 7.9, 5.1, 7.9, 4.2, color='#922B21', lw=1.6)
    ax.text(8.1, 4.6, "1  affecte  0..*", fontsize=8.5, color='#922B21')

    plt.tight_layout()
    plt.savefig(os.path.join(CH4_DIR, 'map_layers_class.png'), bbox_inches='tight')
    plt.close()
    print("Generated Chapter 4 diagrams")

# ==============================================================================
# 5. Chapter 5: AI & Deployment Diagrams
# ==============================================================================
def gen_ch5_diagrams():
    # 5.1 AI Sequence Diagram with Circuit Breaker
    fig, ax = plt.subplots(figsize=(14, 8.5), dpi=300)
    ax.set_xlim(0, 14)
    ax.set_ylim(0, 10)
    ax.axis('off')
    
    lifelines = [
        (1.5, "ReclamationService"),
        (4.5, "GroqService\n(Circuit Breaker)"),
        (7.8, "PriorityQueue\n(Token Bucket)"),
        (10.8, "Groq LPU Cloud\n(LLaMA-3 API)"),
        (13.2, "Deterministic Fallback\n(Heuristics)")
    ]
    
    for x, name in lifelines:
        box = patches.FancyBboxPatch((x - 1.2, 8.8), 2.4, 0.9, boxstyle="round,pad=0.02", facecolor='#FEF9E7', edgecolor='#B7950B', lw=1.5)
        ax.add_patch(box)
        ax.text(x, 9.25, name, ha='center', va='center', fontsize=8.5, fontweight='bold', color='#7D6608')
        ax.plot([x, x], [0.5, 8.8], color='#BDC3C7', linestyle='--', lw=1.5)
        
    messages = [
        (1.5, 4.5, 7.8, "1. enrichReclamation(rawText, priority='high')", True),
        (4.5, 4.5, 7.0, "2. Check CircuitState (CLOSED / OPEN)", False),
        (4.5, 7.8, 6.2, "3. enqueueTask(priority, runFn)", True),
        (7.8, 10.8, 5.4, "4. POST /chat/completions (response_format: json)", True),
        (10.8, 7.8, 4.4, "5. HTTP 200 JSON {category, urgency, recommendation}", False),
        (7.8, 4.5, 3.6, "6. Parse & Validate Structure JSON", False),
        (4.5, 1.5, 2.8, "7. Return EnrichedPayload {source: 'groq'}", False),
        (4.5, 13.2, 1.8, "Alt: Si Timeout/429 -> Exécution Fallback heuristique", True),
        (13.2, 1.5, 1.0, "Alt: Return EnrichedPayload {source: 'deterministic'}", False)
    ]
    
    for x1, x2, y, text, forward in messages:
        if x1 == x2:
            ax.plot([x1, x1 + 0.8, x1 + 0.8, x1], [y + 0.2, y + 0.2, y - 0.2, y - 0.2], color=PRIMARY, lw=1.4)
            ax.text(x1 + 0.9, y, text, fontsize=8.5, va='center', color=TEXT_DARK)
        else:
            style = '->' if forward else '<--'
            ax.annotate('', xy=(x2, y), xytext=(x1, y), arrowprops=dict(arrowstyle="->", color=ACCENT if 'Alt' in text else PRIMARY, lw=1.4))
            ax.text((x1 + x2)/2, y + 0.15, text, fontsize=8.5, ha='center', color=TEXT_DARK)

    plt.tight_layout()
    plt.savefig(os.path.join(CH5_DIR, 'ai_reclamations_sequence.png'), bbox_inches='tight')
    plt.close()
    
    # 5.2 UML Deployment Diagram
    fig, ax = plt.subplots(figsize=(15, 9), dpi=300)
    ax.set_xlim(0, 16)
    ax.set_ylim(0, 10)
    ax.axis('off')
    
    def draw_node(ax, x, y, w, h, title, components, color='#EBF5FB', ec=PRIMARY):
        # 3D Node effect
        d = 0.3
        # Main face
        main = patches.Rectangle((x, y), w, h, facecolor=color, edgecolor=ec, lw=1.8, zorder=3)
        ax.add_patch(main)
        # Top face
        top = patches.Polygon([(x, y+h), (x+d, y+h+d), (x+w+d, y+h+d), (x+w, y+h)], facecolor='#D4E6F1', edgecolor=ec, lw=1.8, zorder=3)
        ax.add_patch(top)
        # Right face
        right = patches.Polygon([(x+w, y), (x+w+d, y+d), (x+w+d, y+h+d), (x+w, y+h)], facecolor='#A9CCE3', edgecolor=ec, lw=1.8, zorder=3)
        ax.add_patch(right)
        
        ax.text(x + w/2, y + h - 0.35, f"<<device>>\n{title}", ha='center', va='top', fontsize=9.5, fontweight='bold', color=TEXT_DARK, zorder=5)
        
        curr_y = y + h - 0.9
        for comp in components:
            c_box = patches.FancyBboxPatch((x + 0.2, curr_y - 0.45), w - 0.4, 0.45, boxstyle="round,pad=0.02", facecolor='white', edgecolor='#7F8C8D', lw=1.2, zorder=4)
            ax.add_patch(c_box)
            ax.text(x + w/2, curr_y - 0.22, f"<<component>> {comp}", ha='center', va='center', fontsize=8, color=PRIMARY, zorder=5)
            curr_y -= 0.65

    # Mobile Node
    draw_node(ax, 0.5, 3.0, 3.8, 4.8, "Client Mobile\n(Android / iOS)", 
              ["Flutter Runtime", "Riverpod State", "flutter_map (GIS)", "flutter_secure_storage"])
              
    # App Server Node
    draw_node(ax, 6.0, 3.0, 4.2, 5.4, "Serveur Back-End\n(Docker / Cloud)", 
              ["Node.js / NestJS Core", "REST API Gateways", "Socket.IO WS Gateway", "Groq AI Supervisor", "BullMQ Queue Manager"])

    # DB Node
    draw_node(ax, 11.8, 5.5, 3.6, 3.6, "Serveur Base de Données\n(MongoDB Cluster)", 
              ["MongoDB 7.0 Engine", "2dsphere Spatial Index", "Database Collections"])

    # Cache Node
    draw_node(ax, 11.8, 0.8, 3.6, 3.6, "Serveur En-Mémoire\n(Redis Instance)", 
              ["Redis 7.2 Engine", "BullMQ Event Queues", "Real-time State Cache"])

    # Connections
    # Mobile -> NestJS
    draw_conn(ax, 4.6, 5.5, 6.0, 5.5, color=PRIMARY, lw=2.0)
    ax.text(5.3, 5.8, "HTTPS / WSS\n(JWT Auth)", fontsize=8.5, ha='center', color=PRIMARY, fontweight='bold')
    
    # NestJS -> MongoDB
    draw_conn(ax, 10.5, 6.8, 11.8, 6.8, color='#117864', lw=2.0)
    ax.text(11.15, 7.1, "TCP / Mongo URI\n(Port 27017)", fontsize=8, ha='center', color='#117864')

    # NestJS -> Redis
    draw_conn(ax, 10.5, 4.0, 11.8, 2.8, color='#C0392B', lw=2.0)
    ax.text(11.15, 3.7, "TCP / Redis Protocol\n(Port 6379)", fontsize=8, ha='center', color='#C0392B')

    plt.tight_layout()
    plt.savefig(os.path.join(CH5_DIR, 'deployment_diagram.png'), bbox_inches='tight')
    plt.close()
    print("Generated Chapter 5 diagrams")

# ==============================================================================
# 6. High-Fidelity UI Mockups Generator
# ==============================================================================
def draw_mobile_frame(ax, title="Smart Fiber"):
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 18)
    ax.axis('off')
    # Phone border
    phone = patches.FancyBboxPatch((0.5, 0.5), 9.0, 17.0, boxstyle="round,pad=0.3", facecolor='#F4F6F7', edgecolor='#2C3E50', lw=3.5, zorder=1)
    ax.add_patch(phone)
    # Screen area
    screen = patches.Rectangle((0.8, 1.2), 8.4, 15.6, facecolor='white', edgecolor='#BDC3C7', lw=1, zorder=2)
    ax.add_patch(screen)
    # App Bar
    appbar = patches.Rectangle((0.8, 15.2), 8.4, 1.6, facecolor=PRIMARY, zorder=3)
    ax.add_patch(appbar)
    ax.text(5.0, 16.0, title, ha='center', va='center', fontsize=12, fontweight='bold', color='white', zorder=5)

def gen_ui_mockups():
    # 1. UI Login (ch3/ui_login.png)
    fig, ax = plt.subplots(figsize=(6, 10), dpi=300)
    draw_mobile_frame(ax, "Smart Fiber - Connexion")
    
    # Logo
    logo = patches.Circle((5.0, 13.0), 1.2, facecolor=PRIMARY, edgecolor='#2980B9', lw=2, zorder=4)
    ax.add_patch(logo)
    ax.text(5.0, 13.0, "TT", ha='center', va='center', fontsize=18, fontweight='bold', color='white', zorder=5)
    
    ax.text(5.0, 11.2, "Authentification Sécurisée", ha='center', fontsize=11, fontweight='bold', color=TEXT_DARK, zorder=5)
    
    # Email input
    input1 = patches.FancyBboxPatch((1.5, 9.4), 7.0, 1.0, boxstyle="round,pad=0.05", facecolor='#F8F9F9', edgecolor='#BDC3C7', lw=1.2, zorder=4)
    ax.add_patch(input1)
    ax.text(2.0, 9.9, "admin.telecom@tt.tn", fontsize=9.5, color='#2C3E50', va='center', zorder=5)
    
    # Password input
    input2 = patches.FancyBboxPatch((1.5, 7.8), 7.0, 1.0, boxstyle="round,pad=0.05", facecolor='#F8F9F9', edgecolor='#BDC3C7', lw=1.2, zorder=4)
    ax.add_patch(input2)
    ax.text(2.0, 8.3, "••••••••••••••", fontsize=11, color='#2C3E50', va='center', zorder=5)
    
    # Login Button
    btn = patches.FancyBboxPatch((1.5, 5.8), 7.0, 1.1, boxstyle="round,pad=0.05", facecolor=ACCENT, edgecolor=ACCENT, zorder=4)
    ax.add_patch(btn)
    ax.text(5.0, 6.35, "Se Connecter", ha='center', va='center', fontsize=11, fontweight='bold', color='white', zorder=5)
    
    plt.tight_layout()
    plt.savefig(os.path.join(CH3_DIR, 'ui_login.png'), bbox_inches='tight')
    plt.close()

    # 2. UI Admin Users (ch3/ui_admin_users.png)
    fig, ax = plt.subplots(figsize=(6, 10), dpi=300)
    draw_mobile_frame(ax, "Gestion des Utilisateurs")
    
    users = [
        ("Amir Ben Zineb", "ADMIN_NATIONAL", "Tunisie Globale", GREEN_SUCCESS),
        ("Mohamed Ali", "RESPONSABLE_ZONE", "Zone Tunis Nord", SECONDARY),
        ("Karim Trabelsi", "TECHNICIEN", "Zone Ariana FDT-04", ORANGE_WARN),
        ("Sami Karray", "TECHNICIEN", "Zone Sfax Ouest", ORANGE_WARN)
    ]
    
    curr_y = 13.8
    for name, role, zone, col in users:
        card = patches.FancyBboxPatch((1.2, curr_y - 1.4), 7.6, 1.3, boxstyle="round,pad=0.05", facecolor='#FDFEFE', edgecolor='#BDC3C7', lw=1.2, zorder=4)
        ax.add_patch(card)
        ax.text(1.6, curr_y - 0.4, name, fontsize=10, fontweight='bold', color=TEXT_DARK, zorder=5)
        ax.text(1.6, curr_y - 0.8, zone, fontsize=8.5, color='#7F8C8D', zorder=5)
        
        tag = patches.FancyBboxPatch((6.0, curr_y - 0.75), 2.5, 0.45, boxstyle="round,pad=0.02", facecolor=col, zorder=4)
        ax.add_patch(tag)
        ax.text(7.25, curr_y - 0.52, role.split('_')[0], ha='center', fontsize=7.5, fontweight='bold', color='white', zorder=5)
        curr_y -= 1.8

    plt.tight_layout()
    plt.savefig(os.path.join(CH3_DIR, 'ui_admin_users.png'), bbox_inches='tight')
    plt.close()

    # 3. UI Create User (ch3/ui_create_user.png)
    fig, ax = plt.subplots(figsize=(6, 10), dpi=300)
    draw_mobile_frame(ax, "Nouveau Collaborateur")
    
    fields = ["Nom Complet", "Adresse Email Pro", "Mot de Passe Initial", "Rôle Applicatif (RBAC)", "Zone d'Affectation"]
    vals = ["Foued Mansour", "f.mansour@tt.tn", "••••••••", "RESPONSABLE_ZONE", "Gouvernorat de Sousse"]
    
    curr_y = 14.0
    for label, val in zip(fields, vals):
        ax.text(1.5, curr_y, label, fontsize=8.5, fontweight='bold', color=PRIMARY, zorder=5)
        box = patches.FancyBboxPatch((1.5, curr_y - 0.9), 7.0, 0.75, boxstyle="round,pad=0.03", facecolor='#F8F9F9', edgecolor='#BDC3C7', lw=1.2, zorder=4)
        ax.add_patch(box)
        ax.text(1.8, curr_y - 0.52, val, fontsize=8.5, color=TEXT_DARK, zorder=5)
        curr_y -= 1.4
        
    btn = patches.FancyBboxPatch((1.5, 4.5), 7.0, 1.0, boxstyle="round,pad=0.03", facecolor=GREEN_SUCCESS, zorder=4)
    ax.add_patch(btn)
    ax.text(5.0, 5.0, "Enregistrer & Activer", ha='center', va='center', fontsize=10, fontweight='bold', color='white', zorder=5)

    plt.tight_layout()
    plt.savefig(os.path.join(CH3_DIR, 'ui_create_user.png'), bbox_inches='tight')
    plt.close()

    # 4. UI Network Map (ch4/ui_network_map.png)
    fig, ax = plt.subplots(figsize=(6, 10), dpi=300)
    draw_mobile_frame(ax, "Supervision SIG FTTH")
    
    # Map mockup background
    map_bg = patches.Rectangle((0.8, 1.2), 8.4, 14.0, facecolor='#E5E8E8', zorder=2)
    ax.add_patch(map_bg)
    
    # Grid lines simulating roads/zones
    ax.plot([1.5, 8.5], [12, 10], color='#D0D3D4', lw=3, zorder=3)
    ax.plot([2.0, 8.0], [5, 14], color='#D0D3D4', lw=4, zorder=3)
    ax.plot([1.0, 9.0], [7, 7.5], color='#D0D3D4', lw=3, zorder=3)
    
    # Zones polygons
    poly = patches.Polygon([(2, 8), (5, 13), (8, 11), (6, 6)], facecolor='#A9DFBF', alpha=0.4, edgecolor=GREEN_SUCCESS, lw=2, zorder=3)
    ax.add_patch(poly)
    
    # Markers NRO
    nro1 = patches.Circle((4.5, 9.5), 0.4, facecolor=PRIMARY, edgecolor='white', lw=1.5, zorder=5)
    ax.add_patch(nro1)
    ax.text(4.5, 9.5, "NRO", ha='center', va='center', fontsize=6, fontweight='bold', color='white', zorder=6)
    
    # FDT Markers
    fdt1 = patches.Circle((3.2, 7.5), 0.3, facecolor=GREEN_SUCCESS, edgecolor='white', lw=1.5, zorder=5)
    fdt2 = patches.Circle((6.2, 11.5), 0.3, facecolor=ACCENT, edgecolor='white', lw=1.5, zorder=5)
    ax.add_patch(fdt1)
    ax.add_patch(fdt2)
    
    # Fiber Lines
    ax.plot([4.5, 3.2], [9.5, 7.5], color=PRIMARY, lw=2, linestyle='-', zorder=4)
    ax.plot([4.5, 6.2], [9.5, 11.5], color=ACCENT, lw=2.5, linestyle='--', zorder=4)
    
    # Info popup
    popup = patches.FancyBboxPatch((1.5, 1.8), 7.0, 3.2, boxstyle="round,pad=0.05", facecolor='white', edgecolor=ACCENT, lw=1.8, zorder=7)
    ax.add_patch(popup)
    ax.text(1.8, 4.4, "⚠️ FDT-Ariana-02 (Alerte Coupure)", fontsize=9, fontweight='bold', color=ACCENT, zorder=8)
    ax.text(1.8, 3.8, "• NRO Rattaché : NRO-Tunis-Nord (Port 08)", fontsize=8, color=TEXT_DARK, zorder=8)
    ax.text(1.8, 3.3, "• Abonnés impactés : 48 clients", fontsize=8, color=TEXT_DARK, zorder=8)
    ax.text(1.8, 2.8, "• Signal Optique : -32 dBm (Critique)", fontsize=8, color=TEXT_DARK, zorder=8)
    ax.text(1.8, 2.3, "• Statut : Équipe d'intervention notifiée", fontsize=8, color=GREEN_SUCCESS, fontweight='bold', zorder=8)

    plt.tight_layout()
    plt.savefig(os.path.join(CH4_DIR, 'ui_network_map.png'), bbox_inches='tight')
    plt.close()

    # 5. UI Dashboard (ch4/ui_dashboard.png)
    fig, ax = plt.subplots(figsize=(6, 10), dpi=300)
    draw_mobile_frame(ax, "Tableau de Bord Opérationnel")
    
    # KPI 1 & 2
    kpi1 = patches.FancyBboxPatch((1.2, 13.2), 3.6, 1.6, boxstyle="round,pad=0.03", facecolor='#E8F8F5', edgecolor=GREEN_SUCCESS, lw=1.5, zorder=4)
    ax.add_patch(kpi1)
    ax.text(3.0, 14.3, "99.2 %", ha='center', fontsize=13, fontweight='bold', color=GREEN_SUCCESS, zorder=5)
    ax.text(3.0, 13.6, "Disponibilité Réseau", ha='center', fontsize=7.5, color=TEXT_DARK, zorder=5)
    
    kpi2 = patches.FancyBboxPatch((5.2, 13.2), 3.6, 1.6, boxstyle="round,pad=0.03", facecolor='#FADBD8', edgecolor=ACCENT, lw=1.5, zorder=4)
    ax.add_patch(kpi2)
    ax.text(7.0, 14.3, "14", ha='center', fontsize=13, fontweight='bold', color=ACCENT, zorder=5)
    ax.text(7.0, 13.6, "Incidents Actifs", ha='center', fontsize=7.5, color=TEXT_DARK, zorder=5)

    # Chart 1: Bar chart
    chart_box = patches.FancyBboxPatch((1.2, 7.8), 7.6, 4.8, boxstyle="round,pad=0.03", facecolor='white', edgecolor='#BDC3C7', lw=1.2, zorder=4)
    ax.add_patch(chart_box)
    ax.text(1.6, 12.0, "Pannes par Gouvernorat", fontsize=9.5, fontweight='bold', color=PRIMARY, zorder=5)
    
    regions = ['Tunis', 'Ariana', 'Sousse', 'Sfax', 'Bizerte']
    vals = [8, 14, 5, 11, 3]
    for i, (r, v) in enumerate(zip(regions, vals)):
        bx = 1.6 + i * 1.4
        by = 8.4
        bh = v * 0.22
        bar = patches.Rectangle((bx, by), 0.9, bh, facecolor=SECONDARY if v < 10 else ACCENT, zorder=5)
        ax.add_patch(bar)
        ax.text(bx + 0.45, by + bh + 0.15, str(v), ha='center', fontsize=7.5, fontweight='bold', zorder=6)
        ax.text(bx + 0.45, by - 0.35, r[:4], ha='center', fontsize=7, color=TEXT_DARK, zorder=6)

    # MTTR Metric
    card3 = patches.FancyBboxPatch((1.2, 2.5), 7.6, 4.6, boxstyle="round,pad=0.03", facecolor='white', edgecolor='#BDC3C7', lw=1.2, zorder=4)
    ax.add_patch(card3)
    ax.text(1.6, 6.4, "Performance de Résolution (MTTR)", fontsize=9.5, fontweight='bold', color=PRIMARY, zorder=5)
    ax.text(1.6, 5.6, "• Temps moyen de réparation : 1h 42min", fontsize=8.5, color=TEXT_DARK, zorder=5)
    ax.text(1.6, 4.9, "• Résolution au 1er passage : 88.5%", fontsize=8.5, color=TEXT_DARK, zorder=5)
    ax.text(1.6, 4.2, "• Équipes terrain déployées : 18 techniciens", fontsize=8.5, color=TEXT_DARK, zorder=5)
    ax.text(1.6, 3.4, "• Satisfaction abonnés (CSAT) : 4.4 / 5.0", fontsize=8.5, color=GREEN_SUCCESS, fontweight='bold', zorder=5)

    plt.tight_layout()
    plt.savefig(os.path.join(CH4_DIR, 'ui_dashboard.png'), bbox_inches='tight')
    plt.close()

    # 6. UI Notifications (ch4/ui_notifications.png)
    fig, ax = plt.subplots(figsize=(6, 10), dpi=300)
    draw_mobile_frame(ax, "Centre d'Alertes Temps Réel")
    
    alerts = [
        ("Coupure Fibre Transport", "NRO-Tunis-01 - 13:45", "CRITICAL", ACCENT),
        ("Seuil Saturation NRO 88%", "NRO-Sousse-Sud - 13:20", "WARNING", ORANGE_WARN),
        ("Ticket Résolu avec succès", "FDT-Ariana-04 - 12:50", "RESOLVED", GREEN_SUCCESS),
        ("Nouveau Contrat Activé", "Zone Sfax Ouest - 11:30", "INFO", SECONDARY)
    ]
    
    curr_y = 14.0
    for title, sub, badge, col in alerts:
        card = patches.FancyBboxPatch((1.2, curr_y - 1.5), 7.6, 1.4, boxstyle="round,pad=0.03", facecolor='#FDFEFE', edgecolor='#BDC3C7', lw=1.2, zorder=4)
        ax.add_patch(card)
        ax.text(1.6, curr_y - 0.45, title, fontsize=9.5, fontweight='bold', color=TEXT_DARK, zorder=5)
        ax.text(1.6, curr_y - 0.9, sub, fontsize=8, color='#7F8C8D', zorder=5)
        
        tag = patches.FancyBboxPatch((6.0, curr_y - 0.7), 2.5, 0.45, boxstyle="round,pad=0.02", facecolor=col, zorder=5)
        ax.add_patch(tag)
        ax.text(7.25, curr_y - 0.48, badge, ha='center', fontsize=7, fontweight='bold', color='white', zorder=6)
        curr_y -= 1.8

    plt.tight_layout()
    plt.savefig(os.path.join(CH4_DIR, 'ui_notifications.png'), bbox_inches='tight')
    plt.close()

    # 7. UI AI Reclamations (ch5/ui_ai_reclamations.png)
    fig, ax = plt.subplots(figsize=(6, 10), dpi=300)
    draw_mobile_frame(ax, "Qualification IA Réclamations")
    
    card = patches.FancyBboxPatch((1.2, 9.5), 7.6, 5.0, boxstyle="round,pad=0.03", facecolor='#FDFEFE', edgecolor=PRIMARY, lw=1.5, zorder=4)
    ax.add_patch(card)
    ax.text(1.6, 13.8, "Détails Réclamation Client #4819", fontsize=9.5, fontweight='bold', color=PRIMARY, zorder=5)
    ax.text(1.6, 13.0, "« Perte totale du signal fibre depuis 2h,\nvoyant LOS rouge clignotant sur ONT »", fontsize=8.5, style='italic', color='#5D6D7E', zorder=5)
    
    # IA Analysis Box
    ai_box = patches.FancyBboxPatch((1.5, 9.8), 7.0, 2.5, boxstyle="round,pad=0.03", facecolor='#FEF9E7', edgecolor='#B7950B', lw=1.2, zorder=5)
    ax.add_patch(ai_box)
    ax.text(1.8, 11.8, "✨ Analyse Automatisée (Groq LLM)", fontsize=8.5, fontweight='bold', color='#7D6608', zorder=6)
    ax.text(1.8, 11.2, "• Catégorie : Rupture de Jarretière Optique", fontsize=8, color=TEXT_DARK, zorder=6)
    ax.text(1.8, 10.7, "• Score d'Urgence : 4 / 5 (Élevé)", fontsize=8, color=ACCENT, fontweight='bold', zorder=6)
    ax.text(1.8, 10.2, "• Action : Dépêcher technicien FDT-04", fontsize=8, color=GREEN_SUCCESS, fontweight='bold', zorder=6)

    # Action button
    btn = patches.FancyBboxPatch((1.2, 7.5), 7.6, 1.1, boxstyle="round,pad=0.03", facecolor=PRIMARY, zorder=4)
    ax.add_patch(btn)
    ax.text(5.0, 8.05, "Assigner au Technicien le plus proche", ha='center', va='center', fontsize=9.5, fontweight='bold', color='white', zorder=5)

    plt.tight_layout()
    plt.savefig(os.path.join(CH5_DIR, 'ui_ai_reclamations.png'), bbox_inches='tight')
    plt.close()

    # 8. UI AI Saturation NRO (ch5/ui_ai_saturation.png)
    fig, ax = plt.subplots(figsize=(6, 10), dpi=300)
    draw_mobile_frame(ax, "Prévision de Saturation NRO")
    
    nros = [
        ("NRO-Sousse-Sud", 92, ACCENT, "Saturation Imminente (< 15j)"),
        ("NRO-Tunis-Nord", 86, ORANGE_WARN, "Seuil d'Alerte Atteint"),
        ("NRO-Sfax-Centre", 64, GREEN_SUCCESS, "Capacité Optimale"),
        ("NRO-Ariana-Est", 48, GREEN_SUCCESS, "Capacité Optimale")
    ]
    
    curr_y = 14.0
    for name, rate, col, desc in nros:
        card = patches.FancyBboxPatch((1.2, curr_y - 1.8), 7.6, 1.7, boxstyle="round,pad=0.03", facecolor='#FDFEFE', edgecolor='#BDC3C7', lw=1.2, zorder=4)
        ax.add_patch(card)
        ax.text(1.6, curr_y - 0.45, name, fontsize=9.5, fontweight='bold', color=TEXT_DARK, zorder=5)
        ax.text(1.6, curr_y - 0.85, desc, fontsize=8, color=col, fontweight='semibold', zorder=5)
        
        # Progress bar
        p_bg = patches.Rectangle((1.6, curr_y - 1.4), 6.8, 0.35, facecolor='#EAEDED', zorder=5)
        p_fill = patches.Rectangle((1.6, curr_y - 1.4), 6.8 * (rate/100.0), 0.35, facecolor=col, zorder=6)
        ax.add_patch(p_bg)
        ax.add_patch(p_fill)
        ax.text(7.2, curr_y - 0.45, f"{rate}%", fontsize=9.5, fontweight='bold', color=col, ha='right', zorder=5)
        curr_y -= 2.2

    plt.tight_layout()
    plt.savefig(os.path.join(CH5_DIR, 'ui_ai_saturation.png'), bbox_inches='tight')
    plt.close()
    print("Generated all UI mockups")

if __name__ == '__main__':
    print("Starting generation of all diagrams and UI mockups...")
    gen_usecase_global()
    gen_class_global()
    gen_ch3_diagrams()
    gen_ch4_diagrams()
    gen_ch5_diagrams()
    gen_ui_mockups()
    print("ALL DIAGRAMS SUCCESSFULLY GENERATED.")
