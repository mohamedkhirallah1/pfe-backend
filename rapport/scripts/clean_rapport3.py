import os
import glob
import re

RAPPORT3_DIR = r"D:\Downloads\Rapport 3"

def clean_rapport3():
    print(f"Analyzing {RAPPORT3_DIR}...")
    
    # 1. Obsolete .tex files not included in main.tex
    unused_tex = [
        os.path.join(RAPPORT3_DIR, "chapters", "contexte.tex"),
        os.path.join(RAPPORT3_DIR, "chapters", "sprint_socle.tex"),
        os.path.join(RAPPORT3_DIR, "chapters", "sprint_superv.tex"),
        os.path.join(RAPPORT3_DIR, "chapters", "sprint_ia_deploy.tex")
    ]
    
    deleted_tex = []
    for f in unused_tex:
        if os.path.exists(f):
            os.remove(f)
            deleted_tex.append(f)
            
    # 2. Unused / duplicate images
    unused_images = [
        os.path.join(RAPPORT3_DIR, "Images", "nest.png"),
        os.path.join(RAPPORT3_DIR, "Images", "ch5", "deployment_diagram.png"),
    ]
    
    deleted_images = []
    for f in unused_images:
        if os.path.exists(f):
            os.remove(f)
            deleted_images.append(f)
            
    print(f"Deleted {len(deleted_tex)} obsolete chapter files:")
    for f in deleted_tex:
        print("  -", f)
        
    print(f"Deleted {len(deleted_images)} unnecessary diagram/image files:")
    for f in deleted_images:
        print("  -", f)

if __name__ == '__main__':
    clean_rapport3()
