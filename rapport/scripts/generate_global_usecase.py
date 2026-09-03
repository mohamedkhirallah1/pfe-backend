import os
import matplotlib.pyplot as plt
import matplotlib.patches as patches

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG_DIR = os.path.join(BASE_DIR, 'images')
os.makedirs(IMG_DIR, exist_ok=True)

plt.rcParams['font.sans-serif'] = 'DejaVu Sans'
plt.rcParams['font.family'] = 'sans-serif'

# Palette UML sobre & académique
NAVY = '#1B365D'
BLUE = '#2471A3'
LIGHT_BLUE = '#EBF5FB'
BORDER_BLUE = '#2980B9'
DARK_TEXT = '#1A252F'
MUTED_TEXT = '#4A5568'
ARROW_COLOR = '#2C3E50'
EXT_COLOR = '#8E44AD'
INC_COLOR = '#C0392B'

def draw_actor(ax, x, y, name, subtext=None, color='#2C3E50'):
    # Tête
    circle = plt.Circle((x, y + 0.42), 0.17, fill=True, color='#F8FAFC', ec=color, lw=2.2, zorder=6)
    ax.add_patch(circle)
    # Corps
    ax.plot([x, x], [y + 0.25, y - 0.28], color=color, lw=2.4, zorder=6)
    # Bras
    ax.plot([x - 0.32, x + 0.32], [y + 0.08, y + 0.08], color=color, lw=2.4, zorder=6)
    # Jambes
    ax.plot([x, x - 0.25], [y - 0.28, y - 0.72], color=color, lw=2.4, zorder=6)
    ax.plot([x, x + 0.25], [y - 0.28, y - 0.72], color=color, lw=2.4, zorder=6)
    
    # Textes
    ax.text(x, y - 0.90, name, ha='center', va='top', fontsize=10.0, fontweight='bold', color=DARK_TEXT, zorder=7)
    if subtext:
        ax.text(x, y - 1.22, subtext, ha='center', va='top', fontsize=8.5, fontstyle='italic', color=MUTED_TEXT, zorder=7)

def draw_usecase(ax, x, y, w, h, text, is_core=False):
    bg = '#D4E6F1' if is_core else '#EBF5FB'
    ec = NAVY if is_core else BORDER_BLUE
    lw = 2.2 if is_core else 1.6
    ellipse = patches.Ellipse((x, y), w, h, facecolor=bg, edgecolor=ec, lw=lw, zorder=4)
    ax.add_patch(ellipse)
    weight = 'bold' if is_core else 'bold'
    ax.text(x, y, text, ha='center', va='center', fontsize=9.2, color=DARK_TEXT, fontweight=weight, zorder=6, multialignment='center')

def draw_assoc(ax, x1, y1, x2, y2, color=ARROW_COLOR, lw=1.5):
    ax.plot([x1, x2], [y1, y2], color=color, lw=lw, zorder=3)

def draw_dependency(ax, x1, y1, x2, y2, stereotype="<<include>>", color=INC_COLOR):
    ax.annotate(
        '', xy=(x2, y2), xytext=(x1, y1),
        arrowprops=dict(arrowstyle="->", linestyle="dashed", color=color, lw=1.6, shrinkA=8, shrinkB=8),
        zorder=5
    )
    mid_x = (x1 + x2) / 2
    mid_y = (y1 + y2) / 2 + 0.18
    ax.text(mid_x, mid_y, stereotype, ha='center', va='center', fontsize=8.4, fontweight='bold', color=color,
            bbox=dict(boxstyle='round,pad=0.2', facecolor='white', edgecolor='none', alpha=0.9), zorder=7)

def generate_two_actors_global_usecase():
    fig, ax = plt.subplots(figsize=(19, 12), dpi=300)
    ax.set_xlim(-3.2, 18.0)
    ax.set_ylim(-1.0, 11.5)
    ax.axis('off')

    # 1. Limite du Système (System Boundary)
    system_box = patches.FancyBboxPatch(
        (2.2, -0.6), 11.6, 11.6,
        boxstyle="round,pad=0.15",
        facecolor='#FDFEFE',
        edgecolor=NAVY,
        lw=2.4,
        zorder=1
    )
    ax.add_patch(system_box)

    # En-tête Système
    header_box = patches.FancyBboxPatch(
        (2.2, 10.3), 11.6, 0.7,
        boxstyle="round,pad=0.08",
        facecolor=NAVY,
        edgecolor=NAVY,
        lw=1.0,
        zorder=2
    )
    ax.add_patch(header_box)
    ax.text(8.0, 10.65, "Système : Plateforme Smart Fiber Supervision (Tunisie Telecom)", 
            ha='center', va='center', fontsize=13, fontweight='bold', color='white', zorder=3)

    # -------------------------------------------------------------
    # 2. ACTEURS (2 ACTEURS HUMAINS + 2 ACTEURS EXTERNES)
    # -------------------------------------------------------------
    # Acteur Abstrait Parent
    draw_actor(ax, -1.2, 9.8, "Utilisateur Authentifié", "(Acteur Général)")
    
    # 2 Seuls Acteurs Humains Réels
    draw_actor(ax, -1.2, 5.8, "Responsable de Zone", "(Rôle Opérationnel)")
    draw_actor(ax, -1.2, 1.4, "Administrateur", "(Gouvernance Nationale)")

    # Ligne d'héritage d'acteurs à gauche (UML generalization)
    ax.plot([-2.5, -2.5], [1.4, 8.2], color=ARROW_COLOR, lw=1.5, zorder=3)
    ax.plot([-1.8, -2.5], [1.4, 1.4], color=ARROW_COLOR, lw=1.5, zorder=3)
    ax.plot([-1.8, -2.5], [5.8, 5.8], color=ARROW_COLOR, lw=1.5, zorder=3)
    ax.plot([-2.5, -1.2], [8.2, 8.2], color=ARROW_COLOR, lw=1.5, zorder=3)
    
    # Triangle d'héritage fermé sous le texte de l'acteur parent
    tri = patches.Polygon([[-1.2, 8.5], [-1.35, 8.2], [-1.05, 8.2]], closed=True, facecolor='white', edgecolor=ARROW_COLOR, lw=1.6, zorder=8)
    ax.add_patch(tri)

    # Acteurs Secondaires / Systèmes Externes (À Droite)
    # Tête & corps pour Sondes
    circle_ext1 = plt.Circle((15.6, 6.2 + 0.42), 0.17, fill=True, color='#F8FAFC', ec='#2C3E50', lw=2.2, zorder=6)
    ax.add_patch(circle_ext1)
    ax.plot([15.6, 15.6], [6.2 + 0.25, 6.2 - 0.28], color='#2C3E50', lw=2.4, zorder=6)
    ax.plot([15.6 - 0.32, 15.6 + 0.32], [6.2 + 0.08, 6.2 + 0.08], color='#2C3E50', lw=2.4, zorder=6)
    ax.plot([15.6, 15.6 - 0.25], [6.2 - 0.28, 6.2 - 0.72], color='#2C3E50', lw=2.4, zorder=6)
    ax.plot([15.6, 15.6 + 0.25], [6.2 - 0.28, 6.2 - 0.72], color='#2C3E50', lw=2.4, zorder=6)
    ax.text(15.6, 5.35, "«Système Externe»\nSondes Réseau", ha='center', va='top', fontsize=9.5, fontweight='bold', color=DARK_TEXT, zorder=7)
    ax.text(15.6, 4.85, "(Capteurs & Sondes IoT)", ha='center', va='top', fontsize=8.3, fontstyle='italic', color=MUTED_TEXT, zorder=7)

    # Tête & corps pour Groq
    circle_ext2 = plt.Circle((15.6, 2.0 + 0.42), 0.17, fill=True, color='#F8FAFC', ec='#2C3E50', lw=2.2, zorder=6)
    ax.add_patch(circle_ext2)
    ax.plot([15.6, 15.6], [2.0 + 0.25, 2.0 - 0.28], color='#2C3E50', lw=2.4, zorder=6)
    ax.plot([15.6 - 0.32, 15.6 + 0.32], [2.0 + 0.08, 2.0 + 0.08], color='#2C3E50', lw=2.4, zorder=6)
    ax.plot([15.6, 15.6 - 0.25], [2.0 - 0.28, 2.0 - 0.72], color='#2C3E50', lw=2.4, zorder=6)
    ax.plot([15.6, 15.6 + 0.25], [2.0 - 0.28, 2.0 - 0.72], color='#2C3E50', lw=2.4, zorder=6)
    ax.text(15.6, 1.15, "«Service Externe»\nGroq LPU Cloud", ha='center', va='top', fontsize=9.5, fontweight='bold', color=DARK_TEXT, zorder=7)
    ax.text(15.6, 0.65, "(Moteur LLM IA)", ha='center', va='top', fontsize=8.3, fontstyle='italic', color=MUTED_TEXT, zorder=7)

    # -------------------------------------------------------------
    # 3. CAS D'UTILISATION (RÉPARTIS PAR MODULES)
    # -------------------------------------------------------------
    # Socle Commun (Lié à Utilisateur Authentifié)
    draw_usecase(ax, 4.8, 9.4, 3.4, 0.85, "S'authentifier\n(JWT / Sécurité)", is_core=True)
    draw_usecase(ax, 9.4, 9.4, 3.4, 0.85, "Consulter profil &\nGérer sa session")

    # Module Cartographie SIG Régionale & Équipements
    draw_usecase(ax, 5.0, 7.2, 3.9, 0.95, "Superviser la carte SIG\n(NRO, FDT, Contrats)")
    draw_usecase(ax, 10.2, 7.2, 3.8, 0.90, "Filtrer équipements\npar zone / BoundingBox")

    # Module Alertes Réseau & Flux Temps Réel
    draw_usecase(ax, 5.0, 5.3, 3.9, 0.90, "Recevoir alertes &\nflux temps réel (WS)")
    draw_usecase(ax, 10.2, 5.3, 3.7, 0.85, "Ingérer les coupures\névénementielles")

    # Module Tableau de Bord & Décision Prédictive
    draw_usecase(ax, 5.0, 3.5, 3.9, 0.90, "Consulter KPIs &\nTableau de Bord Zone")
    draw_usecase(ax, 10.2, 3.5, 3.8, 0.90, "Calculer saturation\npréventive NRO")

    # Module IA & Réclamations Clients
    draw_usecase(ax, 5.0, 1.7, 3.9, 0.90, "Traiter les réclamations\ndes abonnés")
    draw_usecase(ax, 10.2, 1.7, 3.9, 0.90, "Classifier & Enrichir\npar IA (Groq LLM)")

    # Module Administration Système & Gouvernance
    draw_usecase(ax, 5.0, 0.0, 3.9, 0.85, "Gérer les Responsables\n& Découpage des Zones")
    draw_usecase(ax, 10.2, 0.0, 3.7, 0.85, "Auditer les logs &\nTraçabilité globale")

    # -------------------------------------------------------------
    # 4. ASSOCIATIONS ACTEURS <--> CAS D'UTILISATION
    # -------------------------------------------------------------
    # Utilisateur Authentifié -> Socle Commun
    draw_assoc(ax, -0.6, 9.8, 3.1, 9.4)
    draw_assoc(ax, -0.6, 9.8, 7.7, 9.4)

    # Responsable de Zone -> Carte, Alertes, Dashboard, Réclamations
    draw_assoc(ax, -0.6, 6.0, 3.1, 7.2)
    draw_assoc(ax, -0.6, 5.8, 3.1, 5.3)
    draw_assoc(ax, -0.6, 5.6, 3.1, 3.5)
    draw_assoc(ax, -0.6, 5.4, 3.1, 1.7)

    # Administrateur National -> Gestion Zones/Users, Audit, + Supervision Globale
    draw_assoc(ax, -0.6, 1.8, 3.1, 3.5)
    draw_assoc(ax, -0.6, 1.5, 3.1, 1.7)
    draw_assoc(ax, -0.6, 1.3, 3.1, 0.0)
    draw_assoc(ax, -0.6, 1.1, 8.3, 0.0)

    # Acteurs Externes
    draw_assoc(ax, 15.0, 6.2, 12.1, 5.3)
    draw_assoc(ax, 15.0, 6.2, 12.1, 7.2)
    draw_assoc(ax, 15.0, 2.0, 12.2, 1.7)

    # -------------------------------------------------------------
    # 5. RELATIONS UML : <<include>> & <<extend>>
    # -------------------------------------------------------------
    # <<include>> : Superviser carte -> Filtrer zone
    draw_dependency(ax, 6.95, 7.2, 8.3, 7.2, "<<include>>", INC_COLOR)

    # <<include>> : Alertes temps réel -> Ingestion
    draw_dependency(ax, 6.95, 5.3, 8.35, 5.3, "<<include>>", INC_COLOR)

    # <<extend>> : Dashboard KPI <- Calcul Saturation NRO
    draw_dependency(ax, 8.3, 3.5, 6.95, 3.5, "<<extend>>", EXT_COLOR)

    # <<include>> : Traiter réclamations -> Classifier IA
    draw_dependency(ax, 6.95, 1.7, 8.25, 1.7, "<<include>>", INC_COLOR)

    # -------------------------------------------------------------
    # 6. LÉGENDE UML NORMATIVE
    # -------------------------------------------------------------
    leg_x, leg_y = 14.2, 9.4
    legend_box = patches.FancyBboxPatch(
        (leg_x - 0.2, leg_y - 1.6), 3.8, 2.4,
        boxstyle="round,pad=0.08",
        facecolor='#F8FAFC',
        edgecolor='#CBD5E1',
        lw=1.2,
        zorder=3
    )
    ax.add_patch(legend_box)
    ax.text(leg_x + 1.7, leg_y + 0.5, "Légende UML", ha='center', va='center', fontsize=9.5, fontweight='bold', color=DARK_TEXT)
    
    ax.plot([leg_x, leg_x + 0.8], [leg_y, leg_y], color=ARROW_COLOR, lw=1.5)
    ax.text(leg_x + 1.0, leg_y, "Association", va='center', fontsize=8.2, color=DARK_TEXT)
    
    ax.plot([leg_x, leg_x + 0.8], [leg_y - 0.5, leg_y - 0.5], color=INC_COLOR, linestyle='--', lw=1.5)
    ax.text(leg_x + 1.0, leg_y - 0.5, "«include» (Obligatoire)", va='center', fontsize=8.2, color=INC_COLOR, fontweight='bold')
    
    ax.plot([leg_x, leg_x + 0.8], [leg_y - 1.0, leg_y - 1.0], color=EXT_COLOR, linestyle='--', lw=1.5)
    ax.text(leg_x + 1.0, leg_y - 1.0, "«extend» (Optionnel)", va='center', fontsize=8.2, color=EXT_COLOR, fontweight='bold')

    plt.tight_layout()
    out_file = os.path.join(IMG_DIR, 'usecase_global.png')
    plt.savefig(out_file, bbox_inches='tight')
    plt.close()
    print(f"Updated 2-Actors global usecase diagram generated at: {out_file}")

if __name__ == '__main__':
    generate_two_actors_global_usecase()
