import tkinter as tk
from tkinter import filedialog
import sys
import os

# Path Documenti
documents = os.path.join(os.path.expanduser("~"), "Documents")

root = tk.Tk()
root.withdraw()
folder_selected = filedialog.askdirectory(
    title="Scegli la cartella di installazione",
    initialdir=documents
)
if not folder_selected:
    sys.exit(1)
print(folder_selected)
