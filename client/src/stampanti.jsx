// src/Stampanti.jsx

import React, { useState, useEffect } from "react";
import { Settings, Home } from "lucide-react";
import NewSlide from "./NewSlide";

const SERVER = "http://192.168.1.250:3001";

// Formatta una data ISO/US/IT in gg-mm-aa (restituisce stringa vuota se data non valida)
function formatDateDMY(dateStr) {
  if (!dateStr) return "";
  let y, m, d;
  if (dateStr.includes("/")) {
    [d, m, y] = dateStr.split("/");
  } else if (dateStr.includes("-")) {
    [y, m, d] = dateStr.split("-");
    if (y && m && d) d = d.split("T")[0];
  } else {
    return dateStr;
  }
  if (!d || !m || !y) return dateStr;
  d = String(d).padStart(2, "0");
  m = String(m).padStart(2, "0");
  y = String(y).slice(-2);
  return `${d}-${m}-${y}`;
}

const COLUMNS_ORDER = [
  "dispositivo",
  "jobid",                       // <── NUOVO: Job ID subito dopo Dispositivo
  "operatornote",
  "jobname",
  "startdate",
  "starttime",
  "readydate",
  "readytime",
  "printsrequested",
  "noffinishedsets",
  "imagewidth",
  "imageheight",
  "printedarea",
  "Inchiostro CMYK",
  "inkcolorwhite",
  "inkcolorvarnish",
  "Costo Inchiostro",            // <-- Costo totale inchiostro in euro
  "mediatype",
  "consumo_kwh",                 // <-- Consumo energia singola stampa
  "Tot Stampe (kWh)",            // <-- Consumo energia totale
];

const HEADER_MAP = {
  dispositivo:            "Dispositivo",
  jobid:                  "Job ID",                    // <── NUOVO
  jobname:                "Nome Lavoro",
  startdate:              "Data Inizio",
  starttime:              "Ora Inizio",
  readydate:              "Data Fine",
  readytime:              "Ora Fine",
  noffinishedsets:        "Set Completati",
  operatornote:           "Nota Operatore",
  imagewidth:             "Larghezza Immagine (mm)",
  imageheight:            "Altezza Immagine (mm)",
  printedarea:            "Area Stampata (m²)",
  "Inchiostro CMYK":      "Inchiostro CMYK (ml)",
  inkcolorwhite:          "Inchiostro Bianco (ml)",
  inkcolorvarnish:        "Vernice (ml)",
  "Costo Inchiostro":     "Costo Inchiostro (€)",
  mediatype:              "Tipo Media",
  consumo_kwh:            "Consumo energia singola stampa (kWh)",
  "Tot Stampe (kWh)":     "Consumo energia totale (kWh)",
  printsrequested:        "Stampe Richieste",
};

export default function Stampanti({ onBack }) {
  const [monitorJsonPath, setMonitorJsonPath] = useState("");
const [reportGeneralePath, setReportGeneralePath] = useState("");
const [storicoConsumiUrl, setStoricoConsumiUrl] = useState("");
const [stampanti, setStampanti] = useState([]);

  const [printerRows, setPrinterRows] = useState([]);
  const [jobSearch, setJobSearch] = useState("");   // 🔍 testo “cerca lavoro”
  const [loading, setLoading] = useState(true);
  const [isNewSlide, setIsNewSlide] = useState(false);
  const [openGroups, setOpenGroups] = useState({});
  const [selectedGroupKey, setSelectedGroupKey] = useState(null);
  const [printerFilter, setPrinterFilter] = useState("tutte");

  // Nuovo: per la tendina settimana
  const [weeksList, setWeeksList] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);

  // Carica impostazioni stampanti
 useEffect(() => {
  fetch(`${SERVER}/api/stampanti/settings`)
    .then(res => res.json())
    .then(data => {
      if (Array.isArray(data.printers)) setStampanti(data.printers);
      if (typeof data.monitorJsonPath === "string") setMonitorJsonPath(data.monitorJsonPath);
      if (typeof data.reportGeneralePath === "string") setReportGeneralePath(data.reportGeneralePath);
      if (typeof data.storicoConsumiUrl === "string") setStoricoConsumiUrl(data.storicoConsumiUrl);
    })
    .catch(console.error);
}, []);



  // Carica le settimane disponibili al primo render
  useEffect(() => {
    fetch(`${SERVER}/api/settimanali-disponibili`)
      .then(res => res.json())
      .then(data => {
        setWeeksList(data);
        // Di default la più recente
        if (data && data.length > 0) {
          setSelectedWeek(data[0].week);
          setSelectedYear(data[0].year);
        }
      })
      .catch(() => setWeeksList([]));
  }, []);

  // Carica solo il report settimanale (per settimana selezionata)
  const fetchWeeklyJobs = (week = selectedWeek, year = selectedYear) => {
    if (!week || !year) return;
    setLoading(true);
    fetch(`${SERVER}/api/storico-settimana?week=${week}&year=${year}`)
      .then(res => res.json())
      .then(data => {
        if (!Array.isArray(data)) {
          setPrinterRows([]);
          return;
        }
        //1️⃣ deduplica client-side
        const seen = new Set();
        const uniqueRows = data.filter(r => {
          const k = getRowKey(r);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        setPrinterRows(uniqueRows);
      })
      .catch(() => setPrinterRows([]))
      .finally(() => setLoading(false));
  };

  // Aggiorna la tabella quando cambia settimana
  useEffect(() => {
    if (selectedWeek && selectedYear) {
      fetchWeeklyJobs(selectedWeek, selectedYear);
    }
    // eslint-disable-next-line
  }, [selectedWeek, selectedYear]);

  const uniquePrinters = Array.from(new Set(printerRows.map(r => r.dispositivo).filter(Boolean)));
  // prima filtra per stampante …
  const byPrinter = printerFilter === "tutte"
    ? printerRows
    : printerRows.filter(r => (r.dispositivo || "") === printerFilter);

  // poi (eventualmente) filtra per testo nel jobname
  const filteredRows = jobSearch.trim() === ""
    ? byPrinter
    : byPrinter.filter(r =>
        (r.jobname || "")
          .toLowerCase()
          .includes(jobSearch.trim().toLowerCase())
      );

  const btnStyle = {
    padding: "10px 20px",
    background: "#1A202C",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    boxShadow: "0 4px 6px rgba(0,0,0,.3)",
    transition: "transform .2s",
  };
  const btnHover = {
    transform: "scale(1.05)",
    boxShadow: "0 6px 8px rgba(0,0,0,.4)",
  };

  function getRowKey(r) {
  const jid = r.jobid || r["Job ID"] || r.documentid || "";
  return [
    r.dispositivo,
    r.startdate,
    r.starttime,
    r.readydate,
    r.readytime,
    r.jobname,
    r.printmode,
    jid, // <── aggiunto
  ].join("|");
}


  return (
    <div style={{
      width: "100vw", height: "100vh", background: "#28282B",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
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
      <div style={{ position: "absolute", top: 10, right: 10 }}>
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

      {/* FILTRI SETTIMANA + STAMPANTE + RICERCA */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 140,
          background: "#23232b",
          borderRadius: 8,
          padding: "10px 10px",
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          gap: 7,
          minWidth: 220,
        }}
      >
        {/* ─── filtro settimana ─── */}
        <div>
          <label style={{ color: "#fff", marginRight: 10 }}>Settimana:</label>
          <select
            value={selectedWeek && selectedYear ? `${selectedWeek}_${selectedYear}` : ""}
            onChange={e => {
              const [w, y] = e.target.value.split("_");
              setSelectedWeek(Number(w));
              setSelectedYear(Number(y));
            }}
            style={{
              fontSize: 15,
              padding: "4px 12px",
              borderRadius: 6,
              background: "#333",
              color: "#fff",
              border: "1px solid #555",
              minWidth: 120
            }}
          >
            {weeksList.map(({ week, year }) => (
              <option key={`${week}_${year}`} value={`${week}_${year}`}>
                {`Settimana ${week} / ${year}`}
              </option>
            ))}
          </select>
        </div>
        {/* ─── filtro stampante ─── */}
        <div>
          <label style={{ color: "#fff", marginRight: 10 }}>Stampante:</label>
          <select
            value={printerFilter}
            onChange={(e) => setPrinterFilter(e.target.value)}
            style={{
              fontSize: 15,
              padding: "4px 12px",
              borderRadius: 6,
              background: "#333",
              color: "#fff",
              border: "1px solid #555",
            }}
          >
            <option value="tutte">Tutte</option>
            {uniquePrinters.map((nome, i) => (
              <option key={i} value={nome}>
                {nome}
              </option>
            ))}
          </select>
        </div>
        {/* ─── cerca nome lavoro ─── */}
        <div>
          <label style={{ color: "#fff", marginRight: 10 }}>Cerca nome lavoro:</label>
          <input
            type="text"
            value={jobSearch}
            onChange={(e) => setJobSearch(e.target.value)}
            placeholder="digita testo…"
            style={{
              fontSize: 15,
              padding: "4px 10px",
              borderRadius: 6,
              background: "#333",
              color: "#fff",
              border: "1px solid #555",
              width: 180,
            }}
          />
        </div>
      </div>

      <h1 style={{ color: "#fff", marginBottom: 20 }}>Pagina Stampanti</h1>

      {monitorJsonPath && (
        <p style={{
          color: "#fff", fontFamily: "monospace",
          wordBreak: "break-all", maxWidth: "90vw",
          marginBottom: 8,
        }}>
          Percorso JSON monitoraggio: {monitorJsonPath}
        </p>
      )}

      {reportGeneralePath && (
        <p style={{
          color: "#fff", fontFamily: "monospace",
          wordBreak: "break-all", maxWidth: "90vw",
          marginBottom: 20,
        }}>
          Percorso REPORT GENERALE: {reportGeneralePath}
        </p>
      )}

      {loading ? (
        <p style={{ color: "#fff" }}>⏳ Caricamento dati stampanti…</p>
      ) : (
        filteredRows.length === 0 ? (
          <p style={{ color: "#fff" }}>Nessun job trovato.</p>
        ) : (
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
                    {COLUMNS_ORDER.map((key, i) => (
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
                        {HEADER_MAP[key] || key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const groupRows = {};
                    for (const row of filteredRows) {
                      const key = [
                        row.dispositivo,
                        row.startdate,
                        row.starttime,
                        row.readydate,
                        row.readytime,
                      ].join(" | ");
                      if (!groupRows[key]) groupRows[key] = [];
                      groupRows[key].push(row);
                    }
                    return Object.entries(groupRows).map(([groupKey, rows], idx) => {
                      const isOpen = openGroups[groupKey];
                      const firstRow = rows[0];
                      const firstRowKey = getRowKey(firstRow);
                      return (
                        <React.Fragment key={groupKey}>
                          <tr
                            style={{
                              background: selectedGroupKey === groupKey ? "#09367a" : "#23232b",
                              cursor: rows.length > 1 ? "pointer" : "default",
                              fontWeight: "normal"
                            }}
                            onClick={() => {
                              setSelectedGroupKey(groupKey);
                              if (rows.length > 1) {
                                setOpenGroups(g => ({
                                  ...g,
                                  [groupKey]: !isOpen
                                }));
                              }
                            }}
                          >
                            {COLUMNS_ORDER.map((k, ci) => (
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
  {(() => {
  // ── NUOVO: Job ID con fallback da più campi
  if (k === "jobid") {
    const id = firstRow.jobid || firstRow["Job ID"] || firstRow.documentid;
    return id || "";
  }

  if (k === "imagewidth" || k === "imageheight") {
    const val = firstRow[k];
    return val !== undefined && val !== null && !isNaN(val)
      ? (Number(val) / 10).toFixed(1)
      : "";
  }
  if (k === "printedarea") {
    const val = firstRow[k];
    return val !== undefined && val !== null && !isNaN(val)
      ? (Number(val) / 1000000).toFixed(3)
      : "";
  }
  if (
    k === "inkcolorcyan" ||
    k === "inkcolormagenta" ||
    k === "inkcoloryellow" ||
    k === "inkcolorblack" ||
    k === "inkcolorwhite" ||
    k === "inkcolorvarnish"
  ) {
    const val = firstRow[k];
    return val !== undefined && val !== null && !isNaN(val)
      ? (Number(val) / 1000).toFixed(3)
      : "";
  }
  if (k === "Inchiostro CMYK") {
    const keys = ["inkcolorcyan", "inkcolormagenta", "inkcoloryellow", "inkcolorblack"];
    const tot = keys
      .map(col => firstRow[col])
      .filter(val => val !== undefined && val !== null && !isNaN(val))
      .reduce((sum, val) => sum + Number(val) / 1000, 0);
    return tot > 0 ? tot.toFixed(3) : "";
  }
  if (
    k === "startdate" ||
    k === "readydate" ||
    k === "receptiondate"
  ) {
    return formatDateDMY(firstRow[k]);
  }
  // Campi energetici e costo inchiostro: li mostro solo se sono numerici
  if (k === "Costo Inchiostro" && firstRow[k] !== undefined && firstRow[k] !== null && !isNaN(firstRow[k])) {
    return Number(firstRow[k]).toFixed(2);
  }
  if (k === "consumo_kwh" && firstRow[k] !== undefined && firstRow[k] !== null && !isNaN(firstRow[k])) {
    return Number(firstRow[k]).toFixed(3);
  }
  if (k === "Tot Stampe (kWh)" && firstRow[k] !== undefined && firstRow[k] !== null && !isNaN(firstRow[k])) {
    return Number(firstRow[k]).toFixed(3);
  }
  return firstRow[k] !== undefined && firstRow[k] !== null
    ? firstRow[k]
    : "";
})()}

    {ci === 0 && rows.length > 1 && (
      <span style={{ marginLeft: 8, color: "#fff" }}>
        {isOpen ? "▼" : "▶"} ({rows.length})
      </span>
    )}
  </td>
))}

                          </tr>
                          {/* Sottorighe visibili SOLO se gruppo aperto */}
                          {isOpen &&
                            rows.slice(1).map((row, i) => {
                              const rowKey = getRowKey(row);
                              return (
                                <tr
                                  key={rowKey}
                                  onClick={e => {
                                    setSelectedGroupKey(groupKey);
                                    e.stopPropagation();
                                  }}
                                  style={{
                                    background: selectedGroupKey === groupKey ? "#09367a" : "#23232b",
                                    color: "#fff",
                                    cursor: "pointer"
                                  }}
                                >
                                 {COLUMNS_ORDER.map((k, ci) => (
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
  {(() => {
  // ── NUOVO: Job ID con fallback da più campi
  if (k === "jobid") {
    const id = row.jobid || row["Job ID"] || row.documentid;
    return id || "";
  }

  if (k === "imagewidth" || k === "imageheight") {
    const val = row[k];
    return val !== undefined && val !== null && !isNaN(val)
      ? (Number(val) / 10).toFixed(1)
      : "";
  }
  if (k === "printedarea") {
    const val = row[k];
    return val !== undefined && val !== null && !isNaN(val)
      ? (Number(val) / 1000000).toFixed(3)
      : "";
  }
  if (
    k === "inkcolorcyan" ||
    k === "inkcolormagenta" ||
    k === "inkcoloryellow" ||
    k === "inkcolorblack" ||
    k === "inkcolorwhite" ||
    k === "inkcolorvarnish"
  ) {
    const val = row[k];
    return val !== undefined && val !== null && !isNaN(val)
      ? (Number(val) / 1000).toFixed(3)
      : "";
  }
  if (k === "Inchiostro CMYK") {
    const keys = ["inkcolorcyan", "inkcolormagenta", "inkcoloryellow", "inkcolorblack"];
    const tot = keys
      .map(col => row[col])
      .filter(val => val !== undefined && val !== null && !isNaN(val))
      .reduce((sum, val) => sum + Number(val) / 1000, 0);
    return tot > 0 ? tot.toFixed(3) : "";
  }
  if (
    k === "startdate" ||
    k === "readydate" ||
    k === "receptiondate"
  ) {
    return formatDateDMY(row[k]);
  }
  // Campi energetici e costo inchiostro: li mostro solo se sono numerici
  if (k === "Costo Inchiostro" && row[k] !== undefined && row[k] !== null && !isNaN(row[k])) {
    return Number(row[k]).toFixed(2);
  }
  if (k === "consumo_kwh" && row[k] !== undefined && row[k] !== null && !isNaN(row[k])) {
    return Number(row[k]).toFixed(3);
  }
  if (k === "Tot Stampe (kWh)" && row[k] !== undefined && row[k] !== null && !isNaN(row[k])) {
    return Number(row[k]).toFixed(3);
  }
  return row[k] !== undefined && row[k] !== null
    ? row[k]
    : "";
})()}

  </td>
))}
                                </tr>
                              );
                            })}
                        </React.Fragment>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      <div style={{ display: "flex", flexDirection: "row", gap: 20, justifyContent: "center", marginBottom: 20 }}>
  <button
    style={btnStyle}
    onMouseOver={e => Object.assign(e.currentTarget.style, btnHover)}
    onMouseOut={e => Object.assign(e.currentTarget.style, btnStyle)}
    onClick={() => window.open("http://192.168.1.250:3000/", "_blank")}
  >
    Consumi kWh
  </button>
  <button
  style={btnStyle}
  onMouseOver={e => Object.assign(e.currentTarget.style, btnHover)}
  onMouseOut={e => Object.assign(e.currentTarget.style, btnStyle)}
  onClick={() => {
    const url = storicoConsumiUrl || "http://192.168.1.250:3000/storico";
    const msg = "Vuoi accedere alla finestra Storico? pin 99999 puk 00000 9999 00000";
    if (window.confirm(msg)) {
      window.open(url, "_blank");
    }
  }}
  title={storicoConsumiUrl ? storicoConsumiUrl : "http://192.168.1.250:3000/storico"}
>
  Storico Consumi
</button>

  <button
    style={btnStyle}
    onMouseOver={e => Object.assign(e.currentTarget.style, btnHover)}
    onMouseOut={e => Object.assign(e.currentTarget.style, btnStyle)}
    onClick={() => fetchWeeklyJobs(selectedWeek, selectedYear)}
  >
    Aggiorna
  </button>
</div>



     {isNewSlide && (
  <NewSlide
    printers={stampanti}
    monitorJsonPath={monitorJsonPath}
    reportGeneralePath={reportGeneralePath}
    storicoConsumiUrl={storicoConsumiUrl}
    onClose={({ printers, monitor, reportGenerale, storicoConsumiUrl }) => {
      setIsNewSlide(false);
      if (Array.isArray(printers)) setStampanti(printers);
      if (monitor) setMonitorJsonPath(monitor.replace(/"/g, "").trim());
      if (reportGenerale) setReportGeneralePath(reportGenerale.replace(/"/g, "").trim());
      if (typeof storicoConsumiUrl === "string") {
        setStoricoConsumiUrl(storicoConsumiUrl.replace(/"/g, "").trim());
      }
    }}
  />
)}


    </div>
  );
}
