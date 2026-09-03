import os
import matplotlib.pyplot as plt
import matplotlib.patches as patches

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG_DIR = os.path.join(BASE_DIR, 'images')
os.makedirs(IMG_DIR, exist_ok=True)

plt.rcParams['font.sans-serif'] = 'DejaVu Sans'
plt.rcParams['font.family'] = 'sans-serif'

NAVY = '#1B365D'
BLUE = '#2471A3'
LIGHT_BLUE = '#EBF5FB'
DARK_TEXT = '#1A252F'
MUTED_TEXT = '#4A5568'
BORDER_COLOR = '#2C3E50'
ASSOC_COLOR = '#2C3E50'

def draw_uml_class(ax, x, y, w, h_header, h_attrs, h_methods, class_name, stereotype=None, attrs=None, methods=None):
    total_h = h_header + h_attrs + h_methods
    top_y = y
    
    # Boîte principale avec bordure
    main_rect = patches.Rectangle((x, top_y - total_h), w, total_h, facecolor='#FFFFFF', edgecolor=BORDER_COLOR, lw=1.6, zorder=3)
    ax.add_patch(main_rect)
    
    # En-tête (Header)
    header_rect = patches.Rectangle((x, top_y - h_header), w, h_header, facecolor='#EAECEE', edgecolor=BORDER_COLOR, lw=1.6, zorder=4)
    ax.add_patch(header_rect)
    
    # Titre classe
    if stereotype:
        ax.text(x + w/2, top_y - 0.22, stereotype, ha='center', va='center', fontsize=8.0, fontstyle='italic', color=MUTED_TEXT, zorder=5)
        ax.text(x + w/2, top_y - h_header + 0.25, class_name, ha='center', va='center', fontsize=9.8, fontweight='bold', color=DARK_TEXT, zorder=5)
    else:
        ax.text(x + w/2, top_y - h_header/2, class_name, ha='center', va='center', fontsize=10.0, fontweight='bold', color=DARK_TEXT, zorder=5)
        
    # Séparateur Attributs / Méthodes
    ax.plot([x, x + w], [top_y - h_header - h_attrs, top_y - h_header - h_attrs], color=BORDER_COLOR, lw=1.2, zorder=4)
    
    # Affichage Attributs
    if attrs:
        attr_y = top_y - h_header - 0.24
        for attr in attrs:
            ax.text(x + 0.2, attr_y, attr, ha='left', va='center', fontsize=8.2, color=DARK_TEXT, zorder=5)
            attr_y -= 0.30
            
    # Affichage Méthodes
    if methods:
        meth_y = top_y - h_header - h_attrs - 0.24
        for meth in methods:
            ax.text(x + 0.2, meth_y, meth, ha='left', va='center', fontsize=8.2, color=DARK_TEXT, zorder=5)
            meth_y -= 0.30

def generate_global_class_diagram():
    fig, ax = plt.subplots(figsize=(21, 14.5), dpi=300)
    ax.set_xlim(-1, 21.5)
    ax.set_ylim(-1, 15.5)
    ax.axis('off')

    # Titre Global
    title_box = patches.FancyBboxPatch(
        (3.0, 14.2), 14.5, 0.9,
        boxstyle="round,pad=0.1",
        facecolor=NAVY,
        edgecolor=NAVY,
        lw=1.0,
        zorder=2
    )
    ax.add_patch(title_box)
    ax.text(10.25, 14.65, "Diagramme de Classes Global du Domaine — Architecture Smart Fiber", 
            ha='center', va='center', fontsize=13, fontweight='bold', color='white', zorder=3)

    # -------------------------------------------------------------
    # 1. CLASSE USER & ROLE ENUM
    # -------------------------------------------------------------
    draw_uml_class(
        ax, x=0.5, y=13.2, w=4.5, h_header=0.8, h_attrs=2.4, h_methods=1.2,
        class_name="User", stereotype="«Document Mongoose»",
        attrs=[
            "- _id: ObjectId",
            "- username: String",
            "- email: String",
            "- passwordHash: String",
            "- role: AppRole",
            "- assignedZoneId?: String",
            "- isActive: Boolean = true"
        ],
        methods=[
            "+ validatePassword(pwd): Boolean",
            "+ hasRole(role): Boolean",
            "+ toJSON(): Object"
        ]
    )

    # Enum AppRole
    draw_uml_class(
        ax, x=0.5, y=8.0, w=4.5, h_header=0.7, h_attrs=1.1, h_methods=0.0,
        class_name="AppRole", stereotype="«Enumeration»",
        attrs=[
            "+ ADMIN = 'ADMIN'",
            "+ RESPONSABLE_ZONE = 'RESPONSABLE_ZONE'"
        ],
        methods=[]
    )

    # -------------------------------------------------------------
    # 2. CLASSE ZONE
    # -------------------------------------------------------------
    draw_uml_class(
        ax, x=6.6, y=13.2, w=4.6, h_header=0.8, h_attrs=2.0, h_methods=1.2,
        class_name="Zone", stereotype="«Document Mongoose»",
        attrs=[
            "- _id: ObjectId",
            "- name: String (unique)",
            "- managerUserId?: String",
            "- isActive: Boolean = true",
            "- geometry: GeoJSON.Polygon"
        ],
        methods=[
            "+ isPointInside(coord): Boolean",
            "+ getBoundingBox(): BBox",
            "+ calculateStats(): ZoneStats"
        ]
    )

    # -------------------------------------------------------------
    # 3. CLASSE NRO
    # -------------------------------------------------------------
    draw_uml_class(
        ax, x=13.2, y=13.2, w=4.8, h_header=0.8, h_attrs=2.6, h_methods=1.2,
        class_name="NRO", stereotype="«Document Mongoose»",
        attrs=[
            "- _id: ObjectId",
            "- externalId: String (unique)",
            "- name: String",
            "- regionId?: String",
            "- location: GeoJSON.Point",
            "- maxCapacity: Number = 600",
            "- currentLoad: Number = 0",
            "- status: NroStatus"
        ],
        methods=[
            "+ getOccupationRate(): Number",
            "+ isSaturated(): Boolean",
            "+ updateLoad(delta): void"
        ]
    )

    # -------------------------------------------------------------
    # 4. CLASSE FDT
    # -------------------------------------------------------------
    draw_uml_class(
        ax, x=13.2, y=7.8, w=4.8, h_header=0.8, h_attrs=2.3, h_methods=1.0,
        class_name="FDT", stereotype="«Document Mongoose»",
        attrs=[
            "- _id: ObjectId",
            "- externalId: String (unique)",
            "- name: String",
            "- nroId: String (ref Nro)",
            "- location: GeoJSON.Point",
            "- capacity: Number = 64",
            "- connectedClients: Number = 0"
        ],
        methods=[
            "+ getCapacityAvailable(): Number",
            "+ linkSubscriber(contractId): void"
        ]
    )

    # -------------------------------------------------------------
    # 5. CLASSE CONTRACT / CLIENT
    # -------------------------------------------------------------
    draw_uml_class(
        ax, x=13.2, y=2.8, w=4.8, h_header=0.8, h_attrs=2.3, h_methods=1.0,
        class_name="Contract", stereotype="«Document Mongoose»",
        attrs=[
            "- _id: ObjectId",
            "- contractNumber: String",
            "- clientCIN: String",
            "- clientPhone: String",
            "- fdtId: String (ref Fdt)",
            "- location: GeoJSON.Point",
            "- status: ContractStatus"
        ],
        methods=[
            "+ isServiceActive(): Boolean",
            "+ getGeoDistanceToFdt(): Number"
        ]
    )

    # -------------------------------------------------------------
    # 6. CLASSE RECLAMATION
    # -------------------------------------------------------------
    draw_uml_class(
        ax, x=6.6, y=7.8, w=4.8, h_header=0.8, h_attrs=3.2, h_methods=1.2,
        class_name="Reclamation", stereotype="«Document Mongoose»",
        attrs=[
            "- _id: ObjectId",
            "- externalId: String",
            "- numeroCIN: String",
            "- description: String",
            "- typeReclamation: TypeRecl",
            "- status: String (NEW, RESOLVED)",
            "- latitude: Number",
            "- longitude: Number",
            "- zoneId?: String",
            "- actionSuggeree?: ActionType"
        ],
        methods=[
            "+ enrichWithGroqAI(): Promise<AIRes>",
            "+ updateStatus(status): void",
            "+ assignToZone(zoneId): void"
        ]
    )

    # -------------------------------------------------------------
    # 7. CLASSE NOTIFICATION
    # -------------------------------------------------------------
    draw_uml_class(
        ax, x=0.5, y=5.8, w=4.5, h_header=0.8, h_attrs=2.4, h_methods=1.0,
        class_name="Notification", stereotype="«Document Mongoose»",
        attrs=[
            "- _id: ObjectId",
            "- eventType: String",
            "- severity: SeverityLevel",
            "- title: String",
            "- message: String",
            "- targetRole: AppRole",
            "- targetZoneId?: String",
            "- isRead: Boolean = false"
        ],
        methods=[
            "+ broadcastWebSocket(): void",
            "+ markAsRead(userId): void"
        ]
    )

    # -------------------------------------------------------------
    # RELATIONS & MULTIPLICITÉS UML (PROPRES & SANS CHEVAUCHEMENT)
    # -------------------------------------------------------------
    # User <-> Role (Dépendance / Typage)
    ax.annotate('', xy=(2.75, 8.0), xytext=(2.75, 8.8),
                arrowprops=dict(arrowstyle="->", linestyle="dashed", color=BORDER_COLOR, lw=1.4))
    ax.text(2.85, 8.4, "«uses»", fontsize=8.0, fontstyle='italic', color=MUTED_TEXT)

    # User (Responsable) 0..1 <---> 1 Zone
    ax.plot([5.0, 6.6], [11.2, 11.2], color=ASSOC_COLOR, lw=1.4, zorder=2)
    ax.text(5.15, 11.4, "0..1", fontsize=8.5, fontweight='bold', color=NAVY)
    ax.text(6.25, 11.4, "1", fontsize=8.5, fontweight='bold', color=NAVY)
    ax.text(5.8, 11.4, "gère", fontsize=8.0, fontstyle='italic', ha='center')

    # Zone 1 <---> 1..* NRO
    ax.plot([11.2, 13.2], [11.2, 11.2], color=ASSOC_COLOR, lw=1.4, zorder=2)
    ax.text(11.35, 11.4, "1", fontsize=8.5, fontweight='bold', color=NAVY)
    ax.text(12.75, 11.4, "1..*", fontsize=8.5, fontweight='bold', color=NAVY)
    ax.text(12.2, 11.4, "contient", fontsize=8.0, fontstyle='italic', ha='center')

    # NRO 1 <---> 1..* FDT
    ax.plot([15.6, 15.6], [8.6, 7.8], color=ASSOC_COLOR, lw=1.4, zorder=2)
    ax.text(15.75, 8.4, "1", fontsize=8.5, fontweight='bold', color=NAVY)
    ax.text(15.75, 8.0, "1..*", fontsize=8.5, fontweight='bold', color=NAVY)
    ax.text(14.8, 8.2, "dessert", fontsize=8.0, fontstyle='italic', ha='center')

    # FDT 1 <---> 0..* Contract
    ax.plot([15.6, 15.6], [3.7, 2.8], color=ASSOC_COLOR, lw=1.4, zorder=2)
    ax.text(15.75, 3.5, "1", fontsize=8.5, fontweight='bold', color=NAVY)
    ax.text(15.75, 3.0, "0..*", fontsize=8.5, fontweight='bold', color=NAVY)
    ax.text(14.8, 3.25, "raccorde", fontsize=8.0, fontstyle='italic', ha='center')

    # Reclamation 0..* <---> 1 Zone
    ax.plot([9.0, 9.0], [7.8, 9.2], color=ASSOC_COLOR, lw=1.4, zorder=2)
    ax.text(9.15, 8.0, "0..*", fontsize=8.5, fontweight='bold', color=NAVY)
    ax.text(9.15, 9.0, "1", fontsize=8.5, fontweight='bold', color=NAVY)
    ax.text(8.2, 8.5, "localisée", fontsize=8.0, fontstyle='italic', ha='center')

    # Reclamation 0..* <---> 0..1 FDT
    ax.plot([11.4, 13.2], [5.6, 5.6], color=ASSOC_COLOR, lw=1.4, zorder=2)
    ax.text(11.55, 5.8, "0..*", fontsize=8.5, fontweight='bold', color=NAVY)
    ax.text(12.75, 5.8, "0..1", fontsize=8.5, fontweight='bold', color=NAVY)
    ax.text(12.3, 5.8, "impacte", fontsize=8.0, fontstyle='italic', ha='center')

    # Notification 0..* <---> 0..1 Zone
    ax.plot([5.0, 6.6], [4.2, 4.2], color=ASSOC_COLOR, lw=1.4, zorder=2)
    ax.text(5.15, 4.4, "0..*", fontsize=8.5, fontweight='bold', color=NAVY)
    ax.text(6.25, 4.4, "0..1", fontsize=8.5, fontweight='bold', color=NAVY)
    ax.text(5.8, 4.4, "notifie", fontsize=8.0, fontstyle='italic', ha='center')

    # -------------------------------------------------------------
    # LÉGENDE DU DIAGRAMME DE CLASSES
    # -------------------------------------------------------------
    leg_box = patches.FancyBboxPatch(
        (0.5, 0.2), 11.2, 1.4,
        boxstyle="round,pad=0.08",
        facecolor='#F8FAFC',
        edgecolor='#CBD5E1',
        lw=1.2,
        zorder=3
    )
    ax.add_patch(leg_box)
    ax.text(0.9, 1.25, "Légende UML & Règles Métier du Domaine :", fontsize=9.0, fontweight='bold', color=DARK_TEXT)
    ax.text(0.9, 0.85, "• Acteurs Réels : Administrateur (Gouvernance complète) & Responsable de Zone (Supervision assignée).", fontsize=8.2, color=DARK_TEXT)
    ax.text(0.9, 0.45, "• Indexation Spatiale 2dsphere (MongoDB) : Zone (Polygon), NRO (Point), FDT (Point), Contract (Point).", fontsize=8.2, color=DARK_TEXT)

    plt.tight_layout()
    out_file = os.path.join(IMG_DIR, 'class_global.png')
    plt.savefig(out_file, bbox_inches='tight')
    plt.close()
    print(f"Refined Global Class Diagram generated successfully at: {out_file}")

if __name__ == '__main__':
    generate_global_class_diagram()
