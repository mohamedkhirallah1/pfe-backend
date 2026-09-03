import os
import re

RAPPORT3_DIR = r"D:\Downloads\Rapport 3"
TEX_FILES = [
    os.path.join(RAPPORT3_DIR, "main.tex"),
    os.path.join(RAPPORT3_DIR, "chapters", "00_abbreviations.tex"),
    os.path.join(RAPPORT3_DIR, "chapters", "00_remerciements.tex"),
    os.path.join(RAPPORT3_DIR, "chapters", "00_resumes.tex"),
    os.path.join(RAPPORT3_DIR, "chapters", "introduction.tex"),
    os.path.join(RAPPORT3_DIR, "chapters", "frontend.tex"),
    os.path.join(RAPPORT3_DIR, "chapters", "requirements.tex"),
    os.path.join(RAPPORT3_DIR, "chapters", "backend.tex"),
    os.path.join(RAPPORT3_DIR, "chapters", "integrations.tex"),
    os.path.join(RAPPORT3_DIR, "chapters", "chapitre5.tex"),
    os.path.join(RAPPORT3_DIR, "chapters", "conclusion.tex"),
    os.path.join(RAPPORT3_DIR, "chapters", "netographie.tex"),
]

used_images = set()
for tf in TEX_FILES:
    if os.path.exists(tf):
        with open(tf, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            matches = re.findall(r'\\includegraphics(?:\[.*?\])?\{([^}]+)\}', content)
            for m in matches:
                # normaliser nom fichier
                basename = os.path.basename(m.replace('\\', '/'))
                used_images.add(basename.lower())
                used_images.add(m.replace('\\', '/').lower())

print("Total unique used image references:", len(used_images))

img_dir = os.path.join(RAPPORT3_DIR, "Images")
all_files = []
if os.path.exists(img_dir):
    for root, dirs, files in os.walk(img_dir):
        for file in files:
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, RAPPORT3_DIR).replace('\\', '/').lower()
            fname = file.lower()
            all_files.append((full_path, rel_path, fname))

print(f"Total image files found in Images/: {len(all_files)}")

unused_files = []
for full_path, rel_path, fname in all_files:
    if fname not in used_images and rel_path not in used_images:
        unused_files.append(full_path)

print("\n--- UNUSED FILES TO DELETE ---")
for f in unused_files:
    print(f)

# Also check unused .tex files (e.g., sprint_socle.tex, sprint_superv.tex, sprint_ia_deploy.tex)
all_tex_in_chapters = os.listdir(os.path.join(RAPPORT3_DIR, "chapters"))
included_tex = [os.path.basename(x) for x in TEX_FILES]
unused_tex = [t for t in all_tex_in_chapters if t not in included_tex]
print("\n--- UNUSED TEX FILES (NOT INCLUDED IN MAIN.TEX) ---")
for t in unused_tex:
    print(os.path.join(RAPPORT3_DIR, "chapters", t))
