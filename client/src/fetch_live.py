import requests, json, csv, os
from datetime import datetime

BASE_URL = "http://192.168.1.40"
URL      = f"{BASE_URL}/x/raw?total@read_energy"

HEADERS = {
    "Referer": f"{BASE_URL}/wsmeasure/big?language=it",
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "application/json, text/plain, */*",
}

COOKIES = {
    "key": "30dc331cff33ffdd50b04cfd448545c021634e2b55c8e89c8cd4909604cfc22148bfa919013c413d9caf4f2bc2819836b821cb83fe41c28d23bf539a52"
}

CSV_FILE = "dati_consumi.csv"

def salva_su_csv(today, week):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    file_exists = os.path.isfile(CSV_FILE)
    with open(CSV_FILE, "a", newline="") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(["timestamp", "today_wh", "week_wh"])
        writer.writerow([now, today, week])

def fetch_energy_data():
    r = requests.get(URL, headers=HEADERS, cookies=COOKIES, timeout=5)
    r.raise_for_status()
    raw = r.text.strip()
    if raw.startswith("ackdata:"):
        raw = raw[len("ackdata:"):]
    data = json.loads(raw)
    e = data["total"]["energy"]
    today_wh = int(e["todaytotalenergy"])
    week_wh  = int(e["thisweektotalenergy"])
    salva_su_csv(today_wh, week_wh)
    return {
        "today": today_wh,
        "week": week_wh
    }
