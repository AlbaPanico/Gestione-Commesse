// src/Protek.jsx

import React, { useState, useEffect } from "react";
import { Settings, Home, RefreshCw } from "lucide-react";
import NewSlideProtek from "./NewSlideProtek";

const SERVER = "http://192.168.1.250:3001";

// Colonne preferite (ordine in alto, ma mostro tutte le colonne)
const PREFERRED_COLUMNS = [
  "ID",
  "PART_PROGRAM_ID",
  "NAME",
  "HASH",
  "PATH",
  "CURRENTFILE",
  "DATE_CREATED",
  "LAST_UPDATED"
];

// Legge i CSV dal backend dati tutti i percorsi monitorPaths
async function fetchAllCsvRows() {
  // 1. Recupera i percorsi file monitoraggio salvati
  const res = await fetch(`${SERVER}/api/protek/settings`);
  const data = await res.json();
  const monitorPaths = Array.isArray(data.monitorPaths)
    ? data.monitorPaths.filter(Boolean)
    : data.monitorPath
    ? [data.monitorPath]
    : [];
  if (!monitorPaths.length) return { columns: PREFERRED_COLUMNS, rows: [] };

  // 2. Recupera i dati da ogni CSV, unifica tutte le righe, crea l’elenco colonne unito
  let allRows = [];
  let allColumns = new Set();
  for (let path of monitorPaths) {
    if (!path || !path.trim()) continue;
    try {
      // Chiama backend: ritorna { headers, rows }
      const r = await fetch(`${SERVER}/api/stampanti/latest-csv?folder=${encodeURIComponent(path.replace(/\\/g, "/").replace(/\/[^\/]*$/, ""))}`);
      const json = await r.json();
      if (json && json.headers && json.rows) {
        json.rows.forEach(rowArr => {
          let obj = {};
          json.headers.forEach((k, i) => {
            obj[k] = rowArr[i];
            allColumns.add(k);
          });
          allRows.push(obj);
        });
      }
    } catch (e) {
      // Se il CSV non viene letto, ignora
      continue;
    }
  }

  // 3. Ordina le colonne: preferite in alto, poi tutte le altre in ordine
  const allCols = [...PREFERRED_COLUMNS, ...[...allColumns].filter(c => !PREFERRED_COLUMNS.includes(c))];

  // 4. Ordina le righe (data più recente sopra, se disponibile)
  allRows.sort((a, b) => {
    const d1 = new Date(a.LAST_UPDATED || a.DATE_CREATED || 0);
    const d2 = new Date(b.LAST_UPDATED || b.DATE_CREATED || 0);
    return d2 - d1;
  });

  return { columns: allCols, rows: allRows };
}

export default function Protek({ onBack }) {
  const [isNewSlide, setIsNewSlide] = useState(false);
  const [columns, setColumns] = useState(PREFERRED_COLUMNS);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const btnStyle = {
    padding: "10px 20px",
    background: "#1A202C",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    boxShadow: "0 4px 6px rgba(0,0,0,.3)",
    transition: "transform .2s"
  };
  const btnHover = {
    transform: "scale(1.05)",
    boxShadow: "0 6px 8px rgba(0,0,0,.4)"
  };

  // Carica i dati dal backend CSV
  const fetchData = async () => {
    setLoading(true);
    try {
      const { columns, rows } = await fetchAllCsvRows();
      setColumns(columns);
      setRows(rows);
    } catch {
      setColumns(PREFERRED_COLUMNS);
      setRows([]);
    }
    setLoading(false);
  };

  // Carica dati all’avvio
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line
  }, []);

  return (
    <div style={{
      width: "100vw",
      height: "100vh",
      background: "#28282B",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      overflow: "auto"
    }}>
      {/* Home */}
      <div style={{ position: "absolute", top: 10, left: 10 }}>
        <button
          style={btnStyle}
          onMouseOver={e => Object.assign(e.currentTarget.style, btnHover)}
          onMouseOut={e => Object.assign(e.currentTarget.style, btnStyle)}
          onClick={onBack}
          title="Torna allo Splash"
        >
          <Home size={24} />
        </button>
      </div>
      {/* Impostazioni */}
      <div style={{ position: "absolute", top: 10, right: 80 }}>
        <button
          style={btnStyle}
          onMouseOver={e => Object.assign(e.currentTarget.style, btnHover)}
          onMouseOut={e => Object.assign(e.currentTarget.style, btnStyle)}
          onClick={() => setIsNewSlide(true)}
          title="Cambia impostazioni"
        >
          <Settings size={24} />
        </button>
      </div>
      {/* Aggiorna */}
      <div style={{ position: "absolute", top: 10, right: 10 }}>
        <button
          style={btnStyle}
          onMouseOver={e => Object.assign(e.currentTarget.style, btnHover)}
          onMouseOut={e => Object.assign(e.currentTarget.style, btnStyle)}
          onClick={fetchData}
          title="Aggiorna dati"
        >
          <RefreshCw size={24} />
        </button>
      </div>

      <h1 style={{ color: "#fff", marginBottom: 20 }}>Pagina Protek</h1>

      {/* Tabella dati */}
      <div
        style={{
          width: "96vw",
          height: "75vh",
          maxWidth: 1800,
          margin: "24px 0",
          background: "#23232b",
          borderRadius: 10,
          boxShadow: "0 2px 10px #0005",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          overflow: "hidden"
        }}
      >
        <div
          style={{
            flex: 1,
            width: "100%",
            height: "100%",
            overflowX: "auto",
            overflowY: "auto",
          }}
        >
          {loading ? (
            <div style={{ color: "#fff", padding: 30 }}>Caricamento dati...</div>
          ) : (
            <table
              style={{
                borderCollapse: "collapse",
                width: "100%",
                minWidth: 1200,
                fontSize: 15,
                background: "#23232b",
              }}
            >
              <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                <tr>
                  {columns.map((col, i) => (
                    <th
                      key={i}
                      style={{
                        border: "1px solid #aaa",
                        padding: "6px 10px",
                        background: "#1A202C",
                        color: "#fff",
                        whiteSpace: "nowrap",
                        position: "sticky",
                        top: 0,
                        zIndex: 2
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    {columns.map((col, ci) => (
                      <td
                        key={ci}
                        style={{
                          border: "1px solid #555",
                          padding: "6px 10px",
                          color: "#fff",
                          whiteSpace: "nowrap",
                          verticalAlign: "middle",
                          fontFamily: "inherit"
                        }}
                      >
                        {row[col] !== undefined && row[col] !== null ? row[col] : ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Bottone impostazioni */}
      {isNewSlide && (
        <NewSlideProtek
          printers={[]}
          monitorJsonPath={""}
          reportGeneralePath={""}
          onClose={() => {
            setIsNewSlide(false);
            // aggiorna subito i dati quando chiudi la slide impostazioni
            fetchData();
          }}
        />
      )}
    </div>
  );
}
