import os
import shutil

NEEDED_IMAGES = {
    # Root Images
    "LOGO_TT_.png", "flutter.png", "riverpod.png", "dio.png", 
    "nestjs.png", "mongodb.png", "bullmq.png", 
    "usecase_global.png", "class_global.png",
    # Chapter 3 Images
    os.path.join("ch3", "auth_usecase.png"),
    os.path.join("ch3", "auth_sequence.png"),
    os.path.join("ch3", "users_global_usecase.png"),
    os.path.join("ch3", "auth_class.png"),
    os.path.join("ch3", "ui_login.png"),
    os.path.join("ch3", "ui_admin_users.png"),
    os.path.join("ch3", "ui_create_user.png"),
    # Chapter 4 Images
    os.path.join("ch4", "network_supervision_usecase.png"),
    os.path.join("ch4", "realtime_sequence.png"),
    os.path.join("ch4", "map_layers_class.png"),
    os.path.join("ch4", "ui_network_map.png"),
    os.path.join("ch4", "ui_dashboard.png"),
    os.path.join("ch4", "ui_notifications.png"),
    # Chapter 5 Images
    os.path.join("ch5", "ai_reclamations_sequence.png"),
    os.path.join("ch5", "deployment_diagram.png"),
    os.path.join("ch5", "ui_ai_reclamations.png"),
    os.path.join("ch5", "ui_ai_saturation.png"),
}

SRC_DIR = r"c:\Users\Asus\smart-fiber-backendd\rapport"
DST_DIR = r"D:\Downloads\Rapport enclh lekher"

def clean_images(img_base):
    if not os.path.exists(img_base):
        return
    for root, dirs, files in os.walk(img_base):
        for f in files:
            full_p = os.path.join(root, f)
            rel_p = os.path.relpath(full_p, img_base)
            if rel_p not in NEEDED_IMAGES:
                print(f"Deleting unneeded diagram: {rel_p} from {img_base}")
                try:
                    os.remove(full_p)
                except Exception as e:
                    print(f"Error removing {full_p}: {e}")

def sync_all():
    print("1. Cleaning images in source...")
    clean_images(os.path.join(SRC_DIR, "Images"))
    
    print("2. Syncing source to destination...")
    if os.path.exists(DST_DIR):
        # Clean destination images
        clean_images(os.path.join(DST_DIR, "Images"))
        
        # Copy chapters
        src_chap = os.path.join(SRC_DIR, "chapters")
        dst_chap = os.path.join(DST_DIR, "chapters")
        os.makedirs(dst_chap, exist_ok=True)
        for f in os.listdir(src_chap):
            s_f = os.path.join(src_chap, f)
            d_f = os.path.join(dst_chap, f)
            if os.path.isfile(s_f):
                shutil.copy2(s_f, d_f)
                print(f"Synced chapter: {f}")
                
        # Copy root files (main.tex, references.bib, etc.)
        for f in ["main.tex", "references.bib"]:
            s_f = os.path.join(SRC_DIR, f)
            d_f = os.path.join(DST_DIR, f)
            if os.path.exists(s_f):
                shutil.copy2(s_f, d_f)
                print(f"Synced root file: {f}")
                
        # Copy images
        src_img = os.path.join(SRC_DIR, "Images")
        dst_img = os.path.join(DST_DIR, "Images")
        os.makedirs(dst_img, exist_ok=True)
        for rel_p in NEEDED_IMAGES:
            s_img = os.path.join(src_img, rel_p)
            d_img = os.path.join(dst_img, rel_p)
            os.makedirs(os.path.dirname(d_img), exist_ok=True)
            if os.path.exists(s_img):
                shutil.copy2(s_img, d_img)
                print(f"Synced image: {rel_p}")

    print("ALL CLEANUP AND SYNC COMPLETED SUCCESSFULLY.")

if __name__ == "__main__":
    sync_all()
