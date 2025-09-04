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

@app.route('/api/materiali', methods=['GET'])
def get_materiali():
    sottocommessa = request.args.get("sottocommessa", "")
    tipo_cf = request.args.get("tipo_cf", "")
    qta_gt_0 = request.args.get("qta_gt_0", "") == "1"

    risultati = []
    if sottocommessa or tipo_cf or qta_gt_0:
        conn_str = (
            "DRIVER={ODBC Driver 17 for SQL Server};"
            "SERVER=192.168.1.251;"
            "DATABASE=ADB_TIME_DISPLAY;"
            "UID=Alessandra;"
            "PWD=alessandra;"
        )
        conn = pyodbc.connect(conn_str)
        cursor = conn.cursor()

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

        if tipo_cf == "cliente":
            query += " AND rig.Cd_CF LIKE 'C%'"
        elif tipo_cf == "fornitore":
            query += " AND rig.Cd_CF LIKE 'F%'"

        if qta_gt_0:
            query += " AND rig.Qta > 0"

        query += " ORDER BY tes.DataDoc DESC, tes.NumeroDoc DESC"

        cursor.execute(query, params)
        columns = [column[0] for column in cursor.description]
        for row in cursor.fetchall():
            row_dict = dict(zip(columns, row))
            # Gestione date
            for key in ["DataDoc", "DataConsegna"]:
                if row_dict.get(key):
                    try:
                        row_dict[key] = row_dict[key].strftime('%d-%m-%Y')
                    except Exception:
                        pass
            # Gestione campo Note (testo libero o None)
            if "Note" in row_dict and row_dict["Note"] is not None:
                row_dict["Note"] = str(row_dict["Note"])
            risultati.append(row_dict)
        conn.close()

    return jsonify(risultati)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5050, debug=True)
