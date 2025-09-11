import os
import time
import json

CMD_FILE = r"\\192.168.1.250\users\applicazioni\gestione commesse\data\apptimepass_cmd.json"

def apri_cartella(percorso):
    print(f"[DEBUG] Apro cartella: {percorso}")
    if os.path.exists(percorso):
        try:
            os.system(f'start "" "{percorso}"')
        except Exception as e:
            print("Errore start:", e)
    else:
        print(f"[DEBUG] Percorso non trovato: {percorso}")

def main():
    print("[AppTimePass] In ascolto di comandi...")
    while True:
        if os.path.exists(CMD_FILE):
            with open(CMD_FILE, "r", encoding="utf-8") as f:
                cmd = json.load(f)
            if cmd.get("action") == "open_folder":
                percorso = cmd.get("folder") or cmd.get("path") or ""
                if percorso:
                    print(f"[AppTimePass] Apro cartella: {percorso}")
                    apri_cartella(percorso)
                else:
                    print("[AppTimePass] Nessun percorso da aprire!")
            # Ignora completamente comandi "mail" o altro
            try:
                os.remove(CMD_FILE)
            except Exception as e:
                print("Errore nel cancellare il file di comando:", e)
        time.sleep(1)

if __name__ == "__main__":
    main()
