import os, time, subprocess, threading
from datetime import datetime
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# === Config ===
REPO_DIR = os.path.abspath(os.path.dirname(__file__))  # cartella della repo
BRANCH = "main"
DEBOUNCE_SEC = 5  # accorpa salvataggi ravvicinati

# Estensioni utili (ignoro roba binaria e pesante)
INCLUDE_EXT = {
    ".py",".js",".jsx",".ts",".tsx",".json",".md",".txt",".yaml",".yml",".toml",
    ".ini",".csv",".ipynb",".css",".html",".ico",".svg",".bat",".ps1"
}
# Cartelle da ignorare sempre
EXCLUDE_DIRS = {".git", "node_modules", "dist", "build", "__pycache__"}

def run(cmd):
    return subprocess.run(cmd, cwd=REPO_DIR, shell=True, capture_output=True, text=True)

class DebouncedPusher:
    def __init__(self, delay):
        self.delay = delay
        self.timer = None
        self.lock = threading.Lock()

    def schedule(self):
        with self.lock:
            if self.timer:
                self.timer.cancel()
            self.timer = threading.Timer(self.delay, self.do_push)
            self.timer.start()

    def do_push(self):
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        run("git add -A")
        status = run("git status --porcelain")
        if not status.stdout.strip():
            print("[skip] nulla da committare")
            return

        commit = run(f'git commit -m "auto: sync {ts}"')
        if commit.returncode != 0:
            # Alcune versioni di Git scrivono "nothing to commit" su stderr: non è un errore reale
            out = (commit.stdout + "\n" + commit.stderr).lower()
            if "nothing to commit" in out or "no changes added to commit" in out:
                print("[skip] nulla da committare")
                return
            print("[ERRORE COMMIT]", (commit.stderr or commit.stdout).strip())
            return

        push = run(f"git push origin {BRANCH}")
        if push.returncode != 0:
            print("[ERRORE PUSH]", push.stderr.strip())
        else:
            print(f"[OK] Pushed at {ts}")

class Handler(FileSystemEventHandler):
    def __init__(self, pusher):
        self.pusher = pusher

    def on_any_event(self, event):
        if event.is_directory:
            return
        rel = os.path.relpath(event.src_path, REPO_DIR)
        parts = rel.split(os.sep)
        if any(p in EXCLUDE_DIRS for p in parts):
            return
        ext = os.path.splitext(rel)[1].lower()
        if INCLUDE_EXT and ext and ext not in INCLUDE_EXT:
            return
        self.pusher.schedule()

if __name__ == "__main__":
    # assicurati di stare su main (crea main se non esiste)
    run(f"git checkout -B {BRANCH}")

    pusher = DebouncedPusher(DEBOUNCE_SEC)
    obs = Observer()
    obs.schedule(Handler(pusher), REPO_DIR, recursive=True)
    obs.start()
    print("✅ Autopush attivo. Lascia questa finestra aperta.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        obs.stop()
    obs.join()
