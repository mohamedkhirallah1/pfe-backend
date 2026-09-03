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
ALT_BOX = '#FADBD8'
ALT_BORDER = '#E74C3C'

def save_diagram(fig, filename):
    plt.tight_layout()
    p1 = os.path.join(IMG_DIR_CH3, filename)
    p2 = os.path.join(IMG_DIR_ROOT, filename)
    fig.savefig(p1, bbox_inches='tight', dpi=300)
    fig.savefig(p2, bbox_inches='tight', dpi=300)
    plt.close(fig)
    print(f"Saved: {filename}")

def draw_actor(ax, x, y, name, subtext=None, color='#2C3E50'):
    circle = plt.Circle((x, y + 0.42), 0.17, fill=True, color='#F8FAFC', ec=color, lw=2.2, zorder=6)
    ax.add_patch(circle)
    ax.plot([x, x], [y + 0.25, y - 0.28], color=color, lw=2.4, zorder=6)
    ax.plot([x - 0.32, x + 0.32], [y + 0.08, y + 0.08], color=color, lw=2.4, zorder=6)
    ax.plot([x, x - 0.25], [y - 0.28, y - 0.72], color=color, lw=2.4, zorder=6)
    ax.plot([x, x + 0.25], [y - 0.28, y - 0.72], color=color, lw=2.4, zorder=6)
    ax.text(x, y - 0.90, name, ha='center', va='top', fontsize=10.0, fontweight='bold', color=DARK_TEXT, zorder=7)
    if subtext:
        ax.text(x, y - 1.20, subtext, ha='center', va='top', fontsize=8.3, fontstyle='italic', color=MUTED_TEXT, zorder=7)

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

def draw_legend(ax, leg_x, leg_y):
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

def draw_uml_class(ax, x, y, w, h_header, h_attrs, h_methods, class_name, stereotype=None, attrs=None, methods=None):
    total_h = h_header + h_attrs + h_methods
    top_y = y
    main_rect = patches.Rectangle((x, top_y - total_h), w, total_h, facecolor='#FFFFFF', edgecolor=NAVY, lw=1.5, zorder=3)
    ax.add_patch(main_rect)
    header_rect = patches.Rectangle((x, top_y - h_header), w, h_header, facecolor='#EAECEE', edgecolor=NAVY, lw=1.5, zorder=4)
    ax.add_patch(header_rect)
    
    if stereotype:
        ax.text(x + w/2, top_y - 0.20, stereotype, ha='center', va='center', fontsize=7.8, fontstyle='italic', color=MUTED_TEXT, zorder=5)
        ax.text(x + w/2, top_y - h_header + 0.22, class_name, ha='center', va='center', fontsize=9.2, fontweight='bold', color=DARK_TEXT, zorder=5)
    else:
        ax.text(x + w/2, top_y - h_header/2, class_name, ha='center', va='center', fontsize=9.5, fontweight='bold', color=DARK_TEXT, zorder=5)
        
    ax.plot([x, x + w], [top_y - h_header - h_attrs, top_y - h_header - h_attrs], color=NAVY, lw=1.0, zorder=4)
    
    if attrs:
        attr_y = top_y - h_header - 0.22
        for attr in attrs:
            ax.text(x + 0.15, attr_y, attr, ha='left', va='center', fontsize=8.0, color=DARK_TEXT, zorder=5)
            attr_y -= 0.28
            
    if methods:
        meth_y = top_y - h_header - h_attrs - 0.22
        for meth in methods:
            ax.text(x + 0.15, meth_y, meth, ha='left', va='center', fontsize=8.0, color=DARK_TEXT, zorder=5)
            meth_y -= 0.28

def draw_lifeline(ax, x, top_y, bottom_y, name, stereotype=None):
    w, h = 2.4, 0.8
    box = patches.Rectangle((x - w/2, top_y - h), w, h, facecolor='#EBF5FB', edgecolor=NAVY, lw=1.5, zorder=4)
    ax.add_patch(box)
    if stereotype:
        ax.text(x, top_y - 0.24, stereotype, ha='center', va='center', fontsize=7.5, fontstyle='italic', color=MUTED_TEXT, zorder=5)
        ax.text(x, top_y - 0.58, name, ha='center', va='center', fontsize=8.5, fontweight='bold', color=DARK_TEXT, zorder=5)
    else:
        ax.text(x, top_y - 0.40, name, ha='center', va='center', fontsize=9.0, fontweight='bold', color=DARK_TEXT, zorder=5)
    
    # Ligne de vie pointillée
    ax.plot([x, x], [top_y - h, bottom_y], color='#7F8C8D', linestyle='--', lw=1.2, zorder=2)

def draw_msg(ax, x1, x2, y, label, is_return=False, is_async=False, is_error=False):
    color = INC_COLOR if is_error else ARROW_COLOR
    style = "--" if is_return else "-"
    arrow_style = "<--" if (is_return and x1 > x2) else ("->" if not is_return else "<-")
    
    ax.annotate(
        '', xy=(x2, y), xytext=(x1, y),
        arrowprops=dict(arrowstyle="->", linestyle=style, color=color, lw=1.3, shrinkA=0, shrinkB=0),
        zorder=4
    )
    mid_x = (x1 + x2) / 2
    offset_y = 0.18
    ax.text(mid_x, y + offset_y, label, ha='center', va='bottom', fontsize=8.0, fontweight='semibold', color=color,
            bbox=dict(boxstyle='round,pad=0.12', facecolor='white', edgecolor='none', alpha=0.9), zorder=5)

# =========================================================================
# 1. DIAGRAMME DE SÉQUENCE : AUTHENTIFICATION (auth_sequence.png)
# =========================================================================
def gen_auth_sequence():
    fig, ax = plt.subplots(figsize=(18, 12), dpi=300)
    ax.set_xlim(-1, 17)
    ax.set_ylim(-1, 11)
    ax.axis('off')

    # Titre
    title_box = patches.FancyBboxPatch((2.5, 10.0), 12.0, 0.7, boxstyle="round,pad=0.08", facecolor=NAVY, edgecolor=NAVY, zorder=2)
    ax.add_patch(title_box)
    ax.text(8.5, 10.35, "Diagramme de Séquence : Processus d'Authentification Sécurisée (JWT & Bcrypt)", ha='center', va='center', fontsize=11, fontweight='bold', color='white')

    # Lignes de vie
    draw_lifeline(ax, 0.8, 9.6, 0.2, "Utilisateur\n(Admin/Resp)", "«Acteur»")
    draw_lifeline(ax, 4.2, 9.6, 0.2, "Flutter UI\n(LoginScreen)", "«View»")
    draw_lifeline(ax, 7.6, 9.6, 0.2, "AuthController\n(NestJS)", "«Controller»")
    draw_lifeline(ax, 11.0, 9.6, 0.2, "AuthService\n(Jwt & Bcrypt)", "«Service»")
    draw_lifeline(ax, 14.4, 9.6, 0.2, "MongoDB\n(users coll)", "«Database»")

    # Barres d'activation
    for lx in [4.2, 7.6, 11.0]:
        act = patches.Rectangle((lx - 0.1, 0.5), 0.2, 8.2, facecolor='#D4E6F1', edgecolor=BORDER_BLUE, lw=1.0, zorder=3)
        ax.add_patch(act)

    # Messages
    draw_msg(ax, 0.8, 4.2, 8.4, "1: Saisir username & mot de passe")
    draw_msg(ax, 4.2, 4.2 + 0.6, 8.0, "2: Valider format formulaire")
    draw_msg(ax, 4.2, 7.6, 7.4, "3: POST /auth/login { username, password }")
    draw_msg(ax, 7.6, 11.0, 6.8, "4: login(username, password)")
    draw_msg(ax, 11.0, 14.4, 6.2, "5: findOne({ username: normalizedUsername })")
    draw_msg(ax, 14.4, 11.0, 5.6, "6: Retourne user Document", is_return=True)
    
    draw_msg(ax, 11.0, 11.0 + 0.6, 5.0, "7: bcrypt.compare(password, user.password)")
    draw_msg(ax, 11.0, 11.0 + 0.6, 4.4, "8: jwtService.signAsync({ sub, role, zoneId })")
    
    draw_msg(ax, 11.0, 7.6, 3.8, "9: { accessToken, user: { id, role, zoneId } }", is_return=True)
    draw_msg(ax, 7.6, 4.2, 3.2, "10: 200 OK + Payload JSON", is_return=True)
    draw_msg(ax, 4.2, 4.2 + 0.6, 2.6, "11: flutter_secure_storage.write(token)")
    draw_msg(ax, 4.2, 0.8, 2.0, "12: Redirection vers le Dashboard selon le Rôle", is_return=True)

    # Cadre Alt (Cas d'erreur)
    alt_box = patches.Rectangle((0.2, 0.4), 15.0, 1.2, facecolor=ALT_BOX, edgecolor=ALT_BORDER, linestyle='--', lw=1.2, zorder=3)
    ax.add_patch(alt_box)
    ax.text(0.4, 1.35, "alt [Identifiants Invalides / Compte Inactif]", fontsize=8.0, fontweight='bold', color=ALT_BORDER)
    draw_msg(ax, 11.0, 4.2, 0.9, "throw UnauthorizedException('Invalid credentials')", is_error=True)
    draw_msg(ax, 4.2, 0.8, 0.5, "Affichage Toast / SnackBar Erreur", is_error=True)

    save_diagram(fig, 'auth_sequence.png')

# =========================================================================
# 2. DIAGRAMME DE CLASSES : AUTHENTIFICATION (auth_class.png)
# =========================================================================
def gen_auth_class():
    fig, ax = plt.subplots(figsize=(19, 11.5), dpi=300)
    ax.set_xlim(-1, 18)
    ax.set_ylim(-1, 12)
    ax.axis('off')

    title_box = patches.FancyBboxPatch((2.5, 10.8), 13.0, 0.7, boxstyle="round,pad=0.08", facecolor=NAVY, edgecolor=NAVY, zorder=2)
    ax.add_patch(title_box)
    ax.text(9.0, 11.15, "Diagramme de Classes du Module Authentification & Sécurité", ha='center', va='center', fontsize=11, fontweight='bold', color='white')

    # AuthController
    draw_uml_class(
        ax, x=0.2, y=10.0, w=4.6, h_header=0.8, h_attrs=0.8, h_methods=1.2,
        class_name="AuthController", stereotype="«Controller NestJS»",
        attrs=["- authService: AuthService"],
        methods=["+ login(dto: LoginDto): Promise<LoginResponse>", "+ getProfile(req): UserProfile"]
    )

    # AuthService
    draw_uml_class(
        ax, x=5.6, y=10.0, w=5.4, h_header=0.8, h_attrs=1.2, h_methods=1.4,
        class_name="AuthService", stereotype="«Service Injectable»",
        attrs=[
            "- jwtService: JwtService",
            "- userModel: Model<User>",
            "- metricsService: MetricsService"
        ],
        methods=[
            "+ login(username, pwd, zoneId?): Promise<LoginResponse>",
            "+ validateUser(payload): Promise<User>",
            "+ hashPassword(pwd): Promise<String>"
        ]
    )

    # LoginDto
    draw_uml_class(
        ax, x=0.2, y=6.4, w=4.6, h_header=0.7, h_attrs=1.4, h_methods=0.0,
        class_name="LoginDto", stereotype="«Data Transfer Object»",
        attrs=[
            "+ username: String",
            "+ password: String",
            "+ requestedZoneId?: String"
        ],
        methods=[]
    )

    # LoginResponse Interface
    draw_uml_class(
        ax, x=5.6, y=6.0, w=5.4, h_header=0.7, h_attrs=1.8, h_methods=0.0,
        class_name="LoginResponse", stereotype="«Interface»",
        attrs=[
            "+ accessToken: String",
            "+ user: {",
            "    id: String,",
            "    username: String,",
            "    role: AppRole,",
            "    zoneId?: String",
            "  }"
        ],
        methods=[]
    )

    # JwtAuthGuard & RolesGuard
    draw_uml_class(
        ax, x=12.0, y=10.0, w=4.8, h_header=0.8, h_attrs=0.9, h_methods=1.2,
        class_name="JwtAuthGuard", stereotype="«Guard NestJS»",
        attrs=["- reflector: Reflector"],
        methods=["+ canActivate(context): Boolean", "+ handleRequest(err, user): User"]
    )

    # User Schema
    draw_uml_class(
        ax, x=12.0, y=6.4, w=4.8, h_header=0.8, h_attrs=2.0, h_methods=0.8,
        class_name="User", stereotype="«Mongoose Document»",
        attrs=[
            "- _id: ObjectId",
            "- username: String",
            "- password: String (hash)",
            "- role: AppRole",
            "- zoneId?: String",
            "- isActive: Boolean"
        ],
        methods=["+ validatePassword(pwd): Boolean"]
    )

    # Relations
    ax.plot([4.8, 5.6], [8.8, 8.8], color=NAVY, lw=1.5)
    ax.text(5.2, 9.0, "«injects»", fontsize=7.5, fontstyle='italic', ha='center')

    ax.plot([2.5, 2.5], [6.4, 7.2], color=NAVY, lw=1.5, linestyle='--')
    ax.text(2.6, 6.8, "«uses»", fontsize=7.5, fontstyle='italic')

    ax.plot([11.0, 12.0], [8.8, 8.8], color=NAVY, lw=1.5)
    ax.text(11.5, 9.0, "«protects»", fontsize=7.5, fontstyle='italic', ha='center')

    ax.plot([11.0, 12.0], [5.0, 5.0], color=NAVY, lw=1.5)
    ax.text(11.5, 5.2, "«queries»", fontsize=7.5, fontstyle='italic', ha='center')

    save_diagram(fig, 'auth_class.png')

# =========================================================================
# 3. DIAGRAMME DE CAS D'UTILISATION GLOBAL : GÉRER LES UTILISATEURS (users_global_usecase.png)
# =========================================================================
def gen_users_global_usecase():
    fig, ax = plt.subplots(figsize=(16, 11), dpi=300)
    ax.set_xlim(-2.5, 14.5)
    ax.set_ylim(-1.0, 10.5)
    ax.axis('off')

    # Limite Système
    system_box = patches.FancyBboxPatch((1.5, -0.6), 11.2, 10.4, boxstyle="round,pad=0.15", facecolor='#FDFEFE', edgecolor=NAVY, lw=2.4, zorder=1)
    ax.add_patch(system_box)

    header_box = patches.FancyBboxPatch((1.5, 9.2), 11.2, 0.6, boxstyle="round,pad=0.08", facecolor=NAVY, edgecolor=NAVY, lw=1.0, zorder=2)
    ax.add_patch(header_box)
    ax.text(7.1, 9.5, "Système : Module de Gestion des Utilisateurs & Responsables de Zone", ha='center', va='center', fontsize=12, fontweight='bold', color='white', zorder=3)

    # Acteur
    draw_actor(ax, -0.8, 4.8, "Administrateur", "(Gouvernance Nationale)")

    # Cas d'utilisation
    draw_usecase(ax, 4.5, 7.8, 3.8, 0.90, "Ajouter un Responsable\nde Zone", is_core=True)
    draw_usecase(ax, 9.8, 7.8, 3.8, 0.90, "Affecter un découpage\nde Zone géographique")

    draw_usecase(ax, 4.5, 5.6, 3.8, 0.90, "Consulter la liste des\nResponsables de Zone", is_core=True)
    draw_usecase(ax, 9.8, 5.6, 3.8, 0.90, "Filtrer par Région &\nStatut d'activité")

    draw_usecase(ax, 4.5, 3.4, 3.8, 0.90, "Modifier un Responsable\nde Zone", is_core=True)
    draw_usecase(ax, 9.8, 3.4, 3.8, 0.90, "Valider contraintes DTO\n& unicité compte")

    draw_usecase(ax, 4.5, 1.2, 3.8, 0.90, "Supprimer / Désactiver\nun Responsable de Zone", is_core=True)
    draw_usecase(ax, 9.8, 1.2, 3.8, 0.90, "Détacher la Zone\naffectée (Audit)")

    # Associations
    draw_assoc(ax, -0.3, 5.2, 2.6, 7.8)
    draw_assoc(ax, -0.3, 5.0, 2.6, 5.6)
    draw_assoc(ax, -0.3, 4.8, 2.6, 3.4)
    draw_assoc(ax, -0.3, 4.6, 2.6, 1.2)

    # Inclusions & Extensions
    draw_dependency(ax, 6.4, 7.8, 7.9, 7.8, "<<include>>", INC_COLOR)
    draw_dependency(ax, 6.4, 5.6, 7.9, 5.6, "<<include>>", INC_COLOR)
    draw_dependency(ax, 6.4, 3.4, 7.9, 3.4, "<<include>>", INC_COLOR)
    draw_dependency(ax, 7.9, 1.2, 6.4, 1.2, "<<extend>>", EXT_COLOR)

    draw_legend(ax, 9.8, -0.1)

    save_diagram(fig, 'users_global_usecase.png')

# =========================================================================
# 4. RAFFINEMENT : AJOUTER UN UTILISATEUR (user_add_usecase.png)
# =========================================================================
def gen_user_add_usecase():
    fig, ax = plt.subplots(figsize=(16, 10), dpi=300)
    ax.set_xlim(-2.5, 14.5)
    ax.set_ylim(-1.0, 9.5)
    ax.axis('off')

    system_box = patches.FancyBboxPatch((1.5, -0.6), 11.2, 9.4, boxstyle="round,pad=0.15", facecolor='#FDFEFE', edgecolor=NAVY, lw=2.4, zorder=1)
    ax.add_patch(system_box)

    header_box = patches.FancyBboxPatch((1.5, 8.2), 11.2, 0.6, boxstyle="round,pad=0.08", facecolor=NAVY, edgecolor=NAVY, lw=1.0, zorder=2)
    ax.add_patch(header_box)
    ax.text(7.1, 8.5, "Système : Raffinement de l'exigence « Ajouter un utilisateur »", ha='center', va='center', fontsize=12, fontweight='bold', color='white', zorder=3)

    draw_actor(ax, -0.8, 4.5, "Administrateur", "(Gouvernance)")

    # Cas Central
    draw_usecase(ax, 4.5, 4.8, 3.8, 0.95, "Créer un compte\nResponsable de Zone", is_core=True)

    # Inclusions
    draw_usecase(ax, 9.6, 6.8, 3.8, 0.90, "Valider contraintes DTO\n(Email, Username, Format)")
    draw_usecase(ax, 9.6, 5.0, 3.8, 0.90, "Hacher le mot de passe\n(Bcrypt - 10 rounds)")
    draw_usecase(ax, 9.6, 3.2, 3.8, 0.90, "Associer la Zone & Région\n(Tunisia Regions)")

    # Extension
    draw_usecase(ax, 4.5, 1.8, 3.8, 0.90, "Afficher message d'erreur\n(Conflit 409 - Email existant)")

    # Associations
    draw_assoc(ax, -0.3, 4.5, 2.6, 4.8)

    # Dépendances
    draw_dependency(ax, 6.4, 5.2, 7.7, 6.5, "<<include>>", INC_COLOR)
    draw_dependency(ax, 6.4, 4.8, 7.7, 5.0, "<<include>>", INC_COLOR)
    draw_dependency(ax, 6.4, 4.4, 7.7, 3.5, "<<include>>", INC_COLOR)
    draw_dependency(ax, 4.5, 2.3, 4.5, 3.8, "<<extend>>", EXT_COLOR)

    draw_legend(ax, 9.8, 1.2)

    save_diagram(fig, 'user_add_usecase.png')

# =========================================================================
# 5. DIAGRAMME DE SÉQUENCE : AJOUTER UN UTILISATEUR (user_add_sequence.png)
# =========================================================================
def gen_user_add_sequence():
    fig, ax = plt.subplots(figsize=(18, 12), dpi=300)
    ax.set_xlim(-1, 17)
    ax.set_ylim(-1, 11)
    ax.axis('off')

    title_box = patches.FancyBboxPatch((2.5, 10.0), 12.0, 0.7, boxstyle="round,pad=0.08", facecolor=NAVY, edgecolor=NAVY, zorder=2)
    ax.add_patch(title_box)
    ax.text(8.5, 10.35, "Diagramme de Séquence : Création d'un Responsable de Zone", ha='center', va='center', fontsize=11, fontweight='bold', color='white')

    draw_lifeline(ax, 0.8, 9.6, 0.2, "Administrateur", "«Acteur»")
    draw_lifeline(ax, 4.2, 9.6, 0.2, "AdminUsersView\n(Flutter)", "«View»")
    draw_lifeline(ax, 7.6, 9.6, 0.2, "UsersController\n(NestJS)", "«Controller»")
    draw_lifeline(ax, 11.0, 9.6, 0.2, "UsersService\n(NestJS)", "«Service»")
    draw_lifeline(ax, 14.4, 9.6, 0.2, "MongoDB\n(users coll)", "«Database»")

    for lx in [4.2, 7.6, 11.0]:
        act = patches.Rectangle((lx - 0.1, 0.5), 0.2, 8.2, facecolor='#D4E6F1', edgecolor=BORDER_BLUE, lw=1.0, zorder=3)
        ax.add_patch(act)

    draw_msg(ax, 0.8, 4.2, 8.4, "1: Remplir formulaire d'ajout (nom, email, zone)")
    draw_msg(ax, 4.2, 7.6, 7.6, "2: POST /users/zone-managers (Bearer JWT, DTO)")
    draw_msg(ax, 7.6, 11.0, 6.8, "3: createZoneManager(createZoneManagerDto)")
    draw_msg(ax, 11.0, 14.4, 6.0, "4: findOne({ $or: [ {email}, {username} ] })")
    draw_msg(ax, 14.4, 11.0, 5.4, "5: null (Aucun conflit)", is_return=True)
    draw_msg(ax, 11.0, 11.0 + 0.6, 4.8, "6: bcrypt.hash(password, 10)")
    draw_msg(ax, 11.0, 14.4, 4.2, "7: userModel.create({ role: RESPONSABLE_ZONE, ... })")
    draw_msg(ax, 14.4, 11.0, 3.6, "8: Saved User Document", is_return=True)
    draw_msg(ax, 11.0, 7.6, 3.0, "9: Return { message, data: zoneManager }", is_return=True)
    draw_msg(ax, 7.6, 4.2, 2.4, "10: 201 Created + Payload", is_return=True)
    draw_msg(ax, 4.2, 0.8, 1.8, "11: Notification Succès + Actualisation Liste", is_return=True)

    alt_box = patches.Rectangle((0.2, 0.4), 15.0, 1.0, facecolor=ALT_BOX, edgecolor=ALT_BORDER, linestyle='--', lw=1.2, zorder=3)
    ax.add_patch(alt_box)
    ax.text(0.4, 1.15, "alt [Conflit Email / Username déjà existant]", fontsize=8.0, fontweight='bold', color=ALT_BORDER)
    draw_msg(ax, 11.0, 4.2, 0.8, "throw ConflictException('User already exists')", is_error=True)
    draw_msg(ax, 4.2, 0.8, 0.5, "Affichage SnackBar 'Compte déjà existant'", is_error=True)

    save_diagram(fig, 'user_add_sequence.png')

# =========================================================================
# 6. DIAGRAMME DE CLASSES : AJOUTER UN UTILISATEUR (user_add_class.png)
# =========================================================================
def gen_user_add_class():
    fig, ax = plt.subplots(figsize=(18, 11.5), dpi=300)
    ax.set_xlim(-1, 17)
    ax.set_ylim(-1, 12)
    ax.axis('off')

    title_box = patches.FancyBboxPatch((2.0, 10.8), 13.0, 0.7, boxstyle="round,pad=0.08", facecolor=NAVY, edgecolor=NAVY, zorder=2)
    ax.add_patch(title_box)
    ax.text(8.5, 11.15, "Diagramme de Classes lié à la Création d'Utilisateur", ha='center', va='center', fontsize=11, fontweight='bold', color='white')

    # UsersController
    draw_uml_class(
        ax, x=0.2, y=10.0, w=4.8, h_header=0.8, h_attrs=0.8, h_methods=1.2,
        class_name="UsersController", stereotype="«Controller NestJS»",
        attrs=["- usersService: UsersService"],
        methods=["+ createZoneManager(dto): Promise<Res>", "+ getTunisiaRegions(): Res"]
    )

    # UsersService
    draw_uml_class(
        ax, x=6.0, y=10.0, w=5.2, h_header=0.8, h_attrs=1.4, h_methods=1.6,
        class_name="UsersService", stereotype="«Service Injectable»",
        attrs=[
            "- userModel: Model<User>",
            "- zonesService?: ZonesService",
            "- metricsService?: MetricsService"
        ],
        methods=[
            "+ createZoneManager(dto): Promise<User>",
            "+ validateUniqueUser(email, user): void",
            "+ getTunisiaRegions(): String[]"
        ]
    )

    # CreateZoneManagerDto
    draw_uml_class(
        ax, x=0.2, y=6.2, w=4.8, h_header=0.7, h_attrs=1.8, h_methods=0.0,
        class_name="CreateZoneManagerDto", stereotype="«DTO Class-Validator»",
        attrs=[
            "+ username: String",
            "+ email: String",
            "+ password: String",
            "+ regionId: String",
            "+ zoneId: String"
        ],
        methods=[]
    )

    # User Entity
    draw_uml_class(
        ax, x=12.0, y=10.0, w=4.5, h_header=0.8, h_attrs=2.0, h_methods=0.8,
        class_name="User", stereotype="«Mongoose Schema»",
        attrs=[
            "- _id: ObjectId",
            "- username: String",
            "- email: String",
            "- password: String",
            "- role: AppRole",
            "- zoneId?: String",
            "- isActive: Boolean = true"
        ],
        methods=["+ toJSON(): Object"]
    )

    # Zone Entity
    draw_uml_class(
        ax, x=12.0, y=5.5, w=4.5, h_header=0.8, h_attrs=1.8, h_methods=0.8,
        class_name="Zone", stereotype="«Mongoose Schema»",
        attrs=[
            "- _id: ObjectId",
            "- name: String",
            "- managerUserId?: String",
            "- geometry: GeoJSON.Polygon"
        ],
        methods=["+ assignManager(userId): void"]
    )

    # Relations
    ax.plot([5.0, 6.0], [8.8, 8.8], color=NAVY, lw=1.5)
    ax.text(5.5, 9.0, "«injects»", fontsize=7.5, fontstyle='italic', ha='center')

    ax.plot([2.6, 2.6], [6.2, 7.2], color=NAVY, lw=1.5, linestyle='--')
    ax.text(2.7, 6.7, "«validates»", fontsize=7.5, fontstyle='italic')

    ax.plot([11.2, 12.0], [8.8, 8.8], color=NAVY, lw=1.5)
    ax.text(11.6, 9.0, "«persists»", fontsize=7.5, fontstyle='italic', ha='center')

    ax.plot([14.2, 14.2], [6.8, 5.5], color=NAVY, lw=1.5)
    ax.text(14.3, 6.2, "1 ── 0..1", fontsize=8.0, fontweight='bold', color=NAVY)

    save_diagram(fig, 'user_add_class.png')

# =========================================================================
# 7. RAFFINEMENT : MODIFIER UN UTILISATEUR (user_update_usecase.png)
# =========================================================================
def gen_user_update_usecase():
    fig, ax = plt.subplots(figsize=(16, 10), dpi=300)
    ax.set_xlim(-2.5, 14.5)
    ax.set_ylim(-1.0, 9.5)
    ax.axis('off')

    system_box = patches.FancyBboxPatch((1.5, -0.6), 11.2, 9.4, boxstyle="round,pad=0.15", facecolor='#FDFEFE', edgecolor=NAVY, lw=2.4, zorder=1)
    ax.add_patch(system_box)

    header_box = patches.FancyBboxPatch((1.5, 8.2), 11.2, 0.6, boxstyle="round,pad=0.08", facecolor=NAVY, edgecolor=NAVY, lw=1.0, zorder=2)
    ax.add_patch(header_box)
    ax.text(7.1, 8.5, "Système : Raffinement de l'exigence « Modifier un utilisateur »", ha='center', va='center', fontsize=12, fontweight='bold', color='white', zorder=3)

    draw_actor(ax, -0.8, 4.5, "Administrateur", "(Gouvernance)")

    # Cas Central
    draw_usecase(ax, 4.5, 4.8, 3.8, 0.95, "Mettre à jour un\nResponsable de Zone", is_core=True)

    # Inclusions
    draw_usecase(ax, 9.6, 6.8, 3.8, 0.90, "Charger données existantes\npar Identifiant (ID)")
    draw_usecase(ax, 9.6, 5.0, 3.8, 0.90, "Valider nouveaux champs DTO\n(Zone, Email, Statut)")
    draw_usecase(ax, 9.6, 3.2, 3.8, 0.90, "Enregistrer modifications &\nJournaliser l'Audit")

    # Extension
    draw_usecase(ax, 4.5, 1.8, 3.8, 0.90, "Réinitialiser mot de passe\n(Hachage Bcrypt optionnel)")

    # Associations
    draw_assoc(ax, -0.3, 4.5, 2.6, 4.8)

    # Dépendances
    draw_dependency(ax, 6.4, 5.2, 7.7, 6.5, "<<include>>", INC_COLOR)
    draw_dependency(ax, 6.4, 4.8, 7.7, 5.0, "<<include>>", INC_COLOR)
    draw_dependency(ax, 6.4, 4.4, 7.7, 3.5, "<<include>>", INC_COLOR)
    draw_dependency(ax, 4.5, 2.3, 4.5, 3.8, "<<extend>>", EXT_COLOR)

    draw_legend(ax, 9.8, 1.2)

    save_diagram(fig, 'user_update_usecase.png')

# =========================================================================
# 8. DIAGRAMME DE SÉQUENCE : MODIFIER UN UTILISATEUR (user_update_sequence.png)
# =========================================================================
def gen_user_update_sequence():
    fig, ax = plt.subplots(figsize=(18, 12), dpi=300)
    ax.set_xlim(-1, 17)
    ax.set_ylim(-1, 11)
    ax.axis('off')

    title_box = patches.FancyBboxPatch((2.5, 10.0), 12.0, 0.7, boxstyle="round,pad=0.08", facecolor=NAVY, edgecolor=NAVY, zorder=2)
    ax.add_patch(title_box)
    ax.text(8.5, 10.35, "Diagramme de Séquence : Mise à Jour d'un Responsable de Zone", ha='center', va='center', fontsize=11, fontweight='bold', color='white')

    draw_lifeline(ax, 0.8, 9.6, 0.2, "Administrateur", "«Acteur»")
    draw_lifeline(ax, 4.2, 9.6, 0.2, "AdminUsersView\n(Flutter)", "«View»")
    draw_lifeline(ax, 7.6, 9.6, 0.2, "UsersController\n(NestJS)", "«Controller»")
    draw_lifeline(ax, 11.0, 9.6, 0.2, "UsersService\n(NestJS)", "«Service»")
    draw_lifeline(ax, 14.4, 9.6, 0.2, "MongoDB\n(users coll)", "«Database»")

    for lx in [4.2, 7.6, 11.0]:
        act = patches.Rectangle((lx - 0.1, 0.5), 0.2, 8.2, facecolor='#D4E6F1', edgecolor=BORDER_BLUE, lw=1.0, zorder=3)
        ax.add_patch(act)

    draw_msg(ax, 0.8, 4.2, 8.4, "1: Modifier informations (email, zone, statut)")
    draw_msg(ax, 4.2, 7.6, 7.6, "2: PATCH /users/zone-managers/:id (DTO)")
    draw_msg(ax, 7.6, 11.0, 6.8, "3: updateZoneManager(id, updateZoneManagerDto)")
    draw_msg(ax, 11.0, 14.4, 6.0, "4: findById(id)")
    draw_msg(ax, 14.4, 11.0, 5.4, "5: Return zoneManager Document", is_return=True)
    draw_msg(ax, 11.0, 11.0 + 0.6, 4.8, "6: Object.assign(zoneManager, dto)")
    draw_msg(ax, 11.0, 14.4, 4.2, "7: zoneManager.save()")
    draw_msg(ax, 14.4, 11.0, 3.6, "8: Updated Document", is_return=True)
    draw_msg(ax, 11.0, 7.6, 3.0, "9: Return { message, data: zoneManager }", is_return=True)
    draw_msg(ax, 7.6, 4.2, 2.4, "10: 200 OK + Payload", is_return=True)
    draw_msg(ax, 4.2, 0.8, 1.8, "11: SnackBar Succès + Refresh Interface", is_return=True)

    alt_box = patches.Rectangle((0.2, 0.4), 15.0, 1.0, facecolor=ALT_BOX, edgecolor=ALT_BORDER, linestyle='--', lw=1.2, zorder=3)
    ax.add_patch(alt_box)
    ax.text(0.4, 1.15, "alt [Utilisateur Inexistant (ID invalide)]", fontsize=8.0, fontweight='bold', color=ALT_BORDER)
    draw_msg(ax, 11.0, 4.2, 0.8, "throw NotFoundException('Zone manager not found')", is_error=True)
    draw_msg(ax, 4.2, 0.8, 0.5, "Affichage Alerte 'Utilisateur introuvable'", is_error=True)

    save_diagram(fig, 'user_update_sequence.png')

def main():
    print("=== Generating all 8 Chapter 3 diagrams ===")
    gen_auth_sequence()
    gen_auth_class()
    gen_users_global_usecase()
    gen_user_add_usecase()
    gen_user_add_sequence()
    gen_user_add_class()
    gen_user_update_usecase()
    gen_user_update_sequence()
    print("=== All 8 diagrams successfully generated! ===")

if __name__ == '__main__':
    main()
