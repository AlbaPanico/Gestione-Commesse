from flask import Flask, request, jsonify
from flask_cors import CORS
import pyodbc
import traceback

app = Flask(__name__)
CORS(app)  # <-- Importante per CORS da frontend!


@app.errorhandler(Exception)
def handle_exception(e):
    print("### ERRORE GENERALE FLASK ###")
    traceback.print_exc()
    return jsonify({"error": str(e)}), 500

from decimal import Decimal
import datetime as _dt

@app.route('/api/materiali', methods=['GET'])
def get_materiali():
    sottocommessa = request.args.get("sottocommessa", "").strip()
    tipo_cf = request.args.get("tipo_cf", "").strip().lower()  # "cliente" | "fornitore" | ""
    qta_gt_0 = request.args.get("qta_gt_0", "").strip() in ("1", "true", "yes")

    # Se nessun filtro, restituisco lista vuota (comportamento attuale)
    if not (sottocommessa or tipo_cf or qta_gt_0):
        return jsonify([])

    conn_str = (
        "DRIVER={ODBC Driver 17 for SQL Server};"
        "SERVER=192.168.1.251;"
        "DATABASE=ADB_TIME_DISPLAY;"
        "UID=Alessandra;"
        "PWD=alessandra;"
        "TrustServerCertificate=yes;"
    )

    query = """
    SELECT
        tes.NumeroDoc,
        tes.DataDoc,
        rig.Cd_CF,
        cli.Descrizione AS ClienteFornitore,
        rig.Cd_AR,
        rig.Descrizione,
        rig.Qta,
        rig.PrezzoUnitarioV,
        rig.Cd_DOSottoCommessa,
        rig.DataConsegna,
        rig.NoteRiga
    FROM DORig rig
    LEFT JOIN DOTes tes ON rig.Id_DOTes = tes.Id_DOTes
    LEFT JOIN CF cli ON rig.Cd_CF = cli.Cd_CF
    WHERE 1=1
    """
    params = []

    if sottocommessa:
        query += " AND rig.Cd_DOSottoCommessa = ?"
        params.append(sottocommessa)

    if tipo_cf in ("cliente", "fornitore"):
        query += " AND rig.Cd_CF LIKE ?"
        params.append("C%" if tipo_cf == "cliente" else "F%")

    if qta_gt_0:
        query += " AND rig.Qta > 0"

    query += " ORDER BY tes.DataDoc DESC, tes.NumeroDoc DESC"

    risultati = []
    try:
        with pyodbc.connect(conn_str, timeout=5) as conn:
            with conn.cursor() as cursor:
                cursor.execute(query, params)
                columns = [c[0] for c in cursor.description]
                for row in cursor.fetchall():
                    d = {}
                    for col, val in zip(columns, row):
                        if isinstance(val, ( _dt.date, _dt.datetime )):
                            d[col] = val.strftime('%d-%m-%Y')
                        elif isinstance(val, Decimal):
                            d[col] = float(val)
                        else:
                            d[col] = val
                    # Testo libero (NoteRiga) sempre stringa se presente
                    if d.get("NoteRiga") is not None:
                        d["NoteRiga"] = str(d["NoteRiga"])
                    risultati.append(d)
    except Exception:
        app.logger.exception("Errore DB in /api/materiali")
        return jsonify({"error": "Errore di accesso al database"}), 500

    return jsonify(risultati)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5050, debug=True)
