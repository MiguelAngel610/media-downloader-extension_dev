import os
import sys
import json
import winreg
import tkinter as tk
from tkinter import messagebox

def install_host(extension_id):
    if not extension_id or len(extension_id) != 32:
        messagebox.showerror("Error", "El Extension ID de Chrome debe tener exactamente 32 caracteres.")
        return

    # Construir el JSON final
    base_dir = os.path.dirname(os.path.abspath(__file__))
    bat_path = os.path.join(base_dir, "host.bat")
    
    # Normalize to Windows backslashes (json.dump escapes them correctly)
    bat_path = bat_path.replace("/", "\\")
    
    manifest = {
      "name": "com.media.downloader",
      "description": "Media Downloader Native Host",
      "path": bat_path,
      "type": "stdio",
      "allowed_origins": [
        f"chrome-extension://{extension_id}/"
      ]
    }
    
    manifest_path = os.path.join(base_dir, "com.media.downloader.json")
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
        
    # Registrar en el registro de Windows (HKEY_CURRENT_USER)
    key_path = r"Software\Google\Chrome\NativeMessagingHosts\com.media.downloader"
    try:
        key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path)
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ, manifest_path)
        winreg.CloseKey(key)
        messagebox.showinfo("Éxito", "¡El Native Host se instaló correctamente!\n\nYa puedes usar la extensión de Chrome.")
        sys.exit(0)
    except Exception as e:
        messagebox.showerror("Error del Registro", f"No se pudo escribir en el registro:\n{e}")

def create_gui():
    root = tk.Tk()
    root.title("Instalador de Media Downloader Host")
    root.geometry("450x200")
    root.resizable(False, False)
    
    tk.Label(root, text="Instalación del Backend para Chrome", font=("Arial", 12, "bold")).pack(pady=10)
    tk.Label(root, text="1. Ve a chrome://extensions/ en tu navegador\n2. Carga la carpeta de la extensión (Cargar Descomprimida)\n3. Copia el 'ID' de la extensión y pégalo abajo:").pack()
    
    entry_id = tk.Entry(root, width=40, font=("Consolas", 10))
    entry_id.pack(pady=10)
    
    tk.Button(root, text="Instalar Host", bg="#3b82f6", fg="white", font=("Arial", 10, "bold"), 
              command=lambda: install_host(entry_id.get().strip())).pack(pady=5)
    
    root.mainloop()

if __name__ == "__main__":
    create_gui()
