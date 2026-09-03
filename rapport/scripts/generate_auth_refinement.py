import os
import matplotlib.pyplot as plt
import matplotlib.patches as patches

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG_DIR_CH3 = os.path.join(BASE_DIR, 'images', 'ch3')
IMG_DIR_ROOT = os.path.join(BASE_DIR, 'images')
os.makedirs(IMG_DIR_CH3, exist_ok=True)
os.makedirs(IMG_DIR_ROOT, exist_ok=True)

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
    ax.text(x, y - 0.90, name, ha='center', va='top', fontsize=10.5, fontweight='bold', color=DARK_TEXT, zorder=7)
    if subtext:
        ax.text(x, y - 1.20, subtext, ha='center', va='top', fontsize=8.5, fontstyle='italic', color=MUTED_TEXT, zorder=7)

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
        arrowprops=dict(arrowstyle="->", linestyle="dashed", color=color, lw=1.6, shrinkA=6, shrinkB=6),
        zorder=5
    )
    mid_x = (x1 + x2) / 2
    mid_y = (y1 + y2) / 2 + 0.18
    ax.text(mid_x, mid_y, stereotype, ha='center', va='center', fontsize=8.2, fontweight='bold', color=color,
            bbox=dict(boxstyle='round,pad=0.18', facecolor='white', edgecolor='none', alpha=0.9), zorder=7)

def generate_auth_refinement_usecase():
    fig, ax = plt.subplots(figsize=(16, 10.5), dpi=300)
    ax.set_xlim(-2.5, 14.5)
    ax.set_ylim(-1.0, 9.5)
    ax.axis('off')

    # 1. Limite du Système (System Boundary)
    system_box = patches.FancyBboxPatch(
        (1.5, -0.6), 11.2, 9.4,
        boxstyle="round,pad=0.15",
        facecolor='#FDFEFE',
        edgecolor=NAVY,
        lw=2.4,
        zorder=1
    )
    ax.add_patch(system_box)

    # En-tête Système
    header_box = patches.FancyBboxPatch(
        (1.5, 8.2), 11.2, 0.6,
        boxstyle="round,pad=0.08",
        facecolor=NAVY,
        edgecolor=NAVY,
        lw=1.0,
        zorder=2
    )
    ax.add_patch(header_box)
    ax.text(7.1, 8.5, "Système : Raffinement du Module Authentification & Sécurité", 
            ha='center', va='center', fontsize=12, fontweight='bold', color='white', zorder=3)

    # -------------------------------------------------------------
    # 2. ACTEUR
    # -------------------------------------------------------------
    draw_actor(ax, -0.8, 4.5, "Utilisateur", "Admin / Resp. Zone")

    # -------------------------------------------------------------
    # 3. CAS D'UTILISATION
    # -------------------------------------------------------------
    # Cas d'utilisation Principal
    draw_usecase(ax, 4.2, 5.0, 3.4, 0.95, "S'authentifier\n(Email & Mot de passe)", is_core=True)

    # Cas d'utilisation Inclus (<<include>>)
    draw_usecase(ax, 9.5, 6.8, 3.8, 0.90, "Vérifier identifiants &\nHachage Bcrypt")
    draw_usecase(ax, 9.5, 5.0, 3.8, 0.90, "Générer jetons JWT\n(Access & Refresh)")

    # Cas d'utilisation Étendus (<<extend>>)
    draw_usecase(ax, 9.5, 3.2, 3.8, 0.90, "Afficher message d'erreur\n(Échec d'authentification)")
    draw_usecase(ax, 4.2, 2.0, 3.4, 0.90, "Renouveler le jeton\n(Refresh Token)")

    # Cas d'utilisation Associé
    draw_usecase(ax, 4.2, 0.2, 3.4, 0.85, "Se déconnecter\n(Révocation session)")

    # -------------------------------------------------------------
    # 4. ASSOCIATIONS ACTEUR <--> CAS D'UTILISATION
    # -------------------------------------------------------------
    draw_assoc(ax, -0.3, 4.7, 2.5, 5.0)
    draw_assoc(ax, -0.3, 4.4, 2.5, 2.0)
    draw_assoc(ax, -0.3, 4.1, 2.5, 0.2)

    # -------------------------------------------------------------
    # 5. RELATIONS UML : <<include>> & <<extend>>
    # -------------------------------------------------------------
    # <<include>> S'authentifier -> Vérifier Bcrypt
    draw_dependency(ax, 5.8, 5.4, 7.7, 6.5, "<<include>>", INC_COLOR)

    # <<include>> S'authentifier -> Générer JWT
    draw_dependency(ax, 5.9, 5.0, 7.6, 5.0, "<<include>>", INC_COLOR)

    # <<extend>> Afficher message d'erreur -> S'authentifier (en cas d'échec)
    draw_dependency(ax, 7.7, 3.5, 5.8, 4.6, "<<extend>>", EXT_COLOR)

    # -------------------------------------------------------------
    # 6. LÉGENDE UML
    # -------------------------------------------------------------
    leg_x, leg_y = 9.8, 1.4
    legend_box = patches.FancyBboxPatch(
        (leg_x - 0.2, leg_y - 1.5), 3.0, 2.0,
        boxstyle="round,pad=0.08",
        facecolor='#F8FAFC',
        edgecolor='#CBD5E1',
        lw=1.2,
        zorder=3
    )
    ax.add_patch(legend_box)
    ax.text(leg_x + 1.3, leg_y + 0.3, "Légende UML", ha='center', va='center', fontsize=9.0, fontweight='bold', color=DARK_TEXT)
    
    ax.plot([leg_x, leg_x + 0.6], [leg_y - 0.1, leg_y - 0.1], color=ARROW_COLOR, lw=1.5)
    ax.text(leg_x + 0.8, leg_y - 0.1, "Association", va='center', fontsize=8.0, color=DARK_TEXT)
    
    ax.plot([leg_x, leg_x + 0.6], [leg_y - 0.55, leg_y - 0.55], color=INC_COLOR, linestyle='--', lw=1.5)
    ax.text(leg_x + 0.8, leg_y - 0.55, "«include»", va='center', fontsize=8.0, color=INC_COLOR, fontweight='bold')
    
    ax.plot([leg_x, leg_x + 0.6], [leg_y - 1.0, leg_y - 1.0], color=EXT_COLOR, linestyle='--', lw=1.5)
    ax.text(leg_x + 0.8, leg_y - 1.0, "«extend»", va='center', fontsize=8.0, color=EXT_COLOR, fontweight='bold')

    plt.tight_layout()
    
    # Enregistrer aux deux emplacements requis (ch3 et racine images)
    out1 = os.path.join(IMG_DIR_CH3, 'auth_usecase.png')
    out2 = os.path.join(IMG_DIR_ROOT, 'auth_usecase.png')
    plt.savefig(out1, bbox_inches='tight')
    plt.savefig(out2, bbox_inches='tight')
    plt.close()
    print(f"Generated auth refinement diagram at:\n- {out1}\n- {out2}")

if __name__ == '__main__':
    generate_auth_refinement_usecase()
