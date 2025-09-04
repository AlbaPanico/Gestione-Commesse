// src/NewSlideProtek.jsx

import React, { useState, useRef, useEffect } from "react";

const SERVER = "http://192.168.1.250:3001";

function buildJsonUnificatoLink(nomePantografo) {
  const cleaned = nomePantografo.trim().replace(/[\s]+/g, " ");
  return `${SERVER}/report_generale/Reportgenerali_${encodeURIComponent(cleaned)}.json`;
}

export default function NewSlideProtek({
  onClose,
  printers: initialPrinters = [],
  monitorJsonPath = "",
  reportGeneralePath = ""
}) {
  const [stampanti, setStampanti] = useState([]);
  const [monitorPaths, setMonitorPaths] = useState([""]);
  const [reportGenerale, setReportGenerale] = useState(reportGeneralePath);

  // Campi form aggiunta pantografi
  const [newLink, setNewLink] = useState("");
  const [newNome, setNewNome] = useState("");
  const [editingIdx, setEditingIdx] = useState(-1);
  const [editLink, setEditLink] = useState("");
  const [editNome, setEditNome] = useState("");
  const panelRef = useRef(null);

  // Carica dati da backend all'apertura (e svuota form aggiunta)
  useEffect(() => {
    fetch(`${SERVER}/api/protek/settings`)
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data.monitorPaths)) setMonitorPaths(data.monitorPaths.length ? data.monitorPaths : [""]);
        else if (data && typeof data.monitorPath === "string") setMonitorPaths([data.monitorPath]);
        if (data && Array.isArray(data.pantografi)) setStampanti(data.pantografi);
        setNewLink("");
        setNewNome("");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleKey = e => {
      if (e.key === "Escape") saveSettingsAndClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  const handleOverlayClick = e => {
    if (!panelRef.current?.contains(e.target)) saveSettingsAndClose();
  };

  // Gestione aggiunta/rimozione file monitoraggio (array)
  const handleMonitorChange = (idx, val) => {
    setMonitorPaths(arr => arr.map((v, i) => (i === idx ? val : v)));
  };
  const handleAddMonitor = () => {
    setMonitorPaths(arr => [...arr, ""]);
  };
  const handleRemoveMonitor = idx => {
    setMonitorPaths(arr => arr.length > 1 ? arr.filter((_, i) => i !== idx) : [""]);
  };

  // Salva impostazioni e chiudi
  const saveSettingsAndClose = () => {
    fetch(`${SERVER}/api/protek/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        monitorPaths: monitorPaths.filter(m => m.trim() !== ""),
        pantografi: stampanti
      }),
    })
      .then(res => res.json())
      .then(() => {
        onClose({
          printers: stampanti,
          monitor: monitorPaths.filter(m => m.trim() !== ""),
          reportGenerale: reportGenerale.replace(/"/g, "").trim()
        });
      })
      .catch(err => {
        alert("Errore nel salvataggio delle impostazioni Protek: " + err);
        onClose({
          printers: stampanti,
          monitor: monitorPaths.filter(m => m.trim() !== ""),
          reportGenerale: reportGenerale.replace(/"/g, "").trim()
        });
      });
  };

  // Bottone aggiungi pantografo: aggiunge solo in lista (NON salva subito)
  const handleAddStampante = () => {
    if (!newLink.trim() || !newNome.trim()) return;
    let link = buildJsonUnificatoLink(newNome);
    setStampanti(prev => [
      ...prev,
      {
        link: newLink.trim(),
        nome: newNome.trim(),
        jsonUnificatoLink: link
      }
    ]);
    setNewLink("");
    setNewNome("");
  };

  const handleRemoveStampante = idx => {
    setStampanti(prev => prev.filter((_, i) => i !== idx));
    if (editingIdx === idx) setEditingIdx(-1);
  };

  const handleEdit = idx => {
    setEditingIdx(idx);
    setEditLink(stampanti[idx].link || "");
    setEditNome(stampanti[idx].nome || "");
  };

  const handleSaveEdit = idx => {
    if (!editLink.trim() || !editNome.trim()) return;
    let link = buildJsonUnificatoLink(editNome);
    setStampanti(prev =>
      prev.map((s, i) =>
        i === idx
          ? {
              link: editLink.trim(),
              nome: editNome.trim(),
              jsonUnificatoLink: link
            }
          : s
      )
    );
    setEditingIdx(-1);
  };

  const handleCancelEdit = () => {
    setEditingIdx(-1);
  };

  return (
    <div
      onClick={handleOverlayClick}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        justifyContent: "flex-end",
        zIndex: 1000,
      }}
    >
      <div
        ref={panelRef}
        style={{
          width: "30%",
          height: "100%",
          background: "#4A5568",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          boxShadow: "-4px 0 8px rgba(0,0,0,0.3)",
        }}
      >
        {/* Pantografi */}
        <div style={{ marginBottom: 8 }}>
          <label style={{ color: "#fff", marginBottom: 4, display: "block" }}>
            Incolla riferimenti Macchina:
          </label>
        </div>
        <div style={{ background: "#374151", padding: 10, borderRadius: 6, marginBottom: 18 }}>
          <input
            autoFocus
            value={newLink}
            onChange={e => setNewLink(e.target.value)}
            placeholder="Link (es: http://192.168.1.82/accounting)"
            style={{
              padding: 8,
              borderRadius: 6,
              border: "1px solid #ccc",
              background: "#2D3748",
              color: "#fff",
              fontFamily: "monospace",
              marginBottom: 8,
              width: "100%"
            }}
          />
          <input
            value={newNome}
            onChange={e => setNewNome(e.target.value)}
            placeholder="Nome Pantografo (es: Protek B)"
            style={{
              padding: 8,
              borderRadius: 6,
              border: "1px solid #ccc",
              background: "#2D3748",
              color: "#fff",
              marginBottom: 8,
              width: "100%"
            }}
          />
          <button
            style={{
              width: "100%",
              background: "#0074D9",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "10px 0",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: 16
            }}
            onClick={handleAddStampante}
            title="Aggiungi Pantografo"
          >Salva</button>
        </div>
        {/* Lista pantografi già inseriti */}
        {stampanti.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <ul style={{ paddingLeft: 0, margin: 0 }}>
              {stampanti.map((s, i) => (
                <li key={i} style={{
                  color: "#cbd5e1", fontSize: 15, marginBottom: 2,
                  display: "flex", alignItems: "flex-start", flexDirection: "column"
                }}>
                  {editingIdx === i ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 5, width: "100%" }}>
                      <input
                        value={editLink}
                        onChange={e => setEditLink(e.target.value)}
                        placeholder="Link (es: http://192.168.1.82/accounting)"
                        style={{
                          padding: 6,
                          borderRadius: 6,
                          border: "1px solid #ccc",
                          background: "#2D3748",
                          color: "#fff",
                          fontFamily: "monospace",
                          marginBottom: 4
                        }}
                      />
                      <input
                        value={editNome}
                        onChange={e => setEditNome(e.target.value)}
                        placeholder="Nome Pantografo (es: Protek B)"
                        style={{
                          padding: 6,
                          borderRadius: 6,
                          border: "1px solid #ccc",
                          background: "#2D3748",
                          color: "#fff",
                          marginBottom: 4
                        }}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => handleSaveEdit(i)}
                          style={{
                            background: "#0074D9",
                            color: "#fff",
                            border: "none",
                            borderRadius: 6,
                            padding: "5px 12px",
                            cursor: "pointer"
                          }}
                          title="Salva modifica"
                        >Salva</button>
                        <button
                          onClick={handleCancelEdit}
                          style={{
                            background: "#e74c3c",
                            color: "#fff",
                            border: "none",
                            borderRadius: 6,
                            padding: "5px 12px",
                            cursor: "pointer"
                          }}
                          title="Annulla modifica"
                        >Annulla</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 10
                    }}>
                      <button
                        onClick={() => handleEdit(i)}
                        title="Modifica"
                        style={{
                          background: "#ffd700",
                          color: "#333",
                          border: "none",
                          borderRadius: "6px",
                          fontWeight: "bold",
                          fontSize: 14,
                          width: 34,
                          height: 28,
                          marginRight: 0,
                          cursor: "pointer"
                        }}
                      >Mod</button>
                      <button
                        onClick={() => handleRemoveStampante(i)}
                        title="Rimuovi Pantografo"
                        style={{
                          background: "#e74c3c",
                          color: "#fff",
                          border: "none",
                          borderRadius: "50%",
                          width: 24,
                          height: 24,
                          fontWeight: "bold",
                          fontSize: 16,
                          cursor: "pointer"
                        }}
                      >×</button>
                      <div style={{ flex: 1 }}>
                        <b>{s.nome}:</b> {s.link}
                        <br />
                        <span style={{ fontSize: 12, color: "#b5f4ff" }}>
                          Link JSON Unificato: {s.jsonUnificatoLink}
                        </span>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* Percorso monitoraggio: MULTIPLO */}
        <label style={{ color: "#fff", marginBottom: 8 }}>
          Incolla i percorsi dei file monitoraggio (uno per riga):
        </label>
        {monitorPaths.map((mp, idx) => (
          <div key={idx} style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
            <input
              value={mp}
              onChange={e => handleMonitorChange(idx, e.target.value)}
              placeholder={`Percorso file CSV monitoraggio #${idx + 1}`}
              style={{
                padding: 10,
                borderRadius: 6,
                border: "1px solid #ccc",
                background: "#2D3748",
                color: "#fff",
                fontFamily: "monospace",
                width: "85%",
                marginRight: 8
              }}
            />
            <button
              style={{
                background: "#e74c3c",
                color: "#fff",
                border: "none",
                borderRadius: "50%",
                width: 26,
                height: 26,
                fontSize: 18,
                fontWeight: "bold",
                cursor: "pointer",
                marginRight: 0
              }}
              onClick={() => handleRemoveMonitor(idx)}
              disabled={monitorPaths.length === 1}
              title="Rimuovi questo file"
            >×</button>
          </div>
        ))}
        <button
          onClick={handleAddMonitor}
          style={{
            marginBottom: 16,
            width: "100%",
            background: "#2ecc40",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "8px 0",
            fontWeight: "bold",
            fontSize: 16,
            cursor: "pointer"
          }}
        >+ Aggiungi altro file monitoraggio</button>

        {/* Percorso REPORT GENERALE */}
        <label style={{ color: "#fff", marginBottom: 8 }}>
          Incolla il percorso REPORT GENERALE:
        </label>
        <input
          value={reportGenerale}
          onChange={e => setReportGenerale(e.target.value)}
          placeholder="C:\\report\\ReportGenerali.xlsx"
          style={{
            padding: 10,
            borderRadius: 6,
            border: "1px solid #ccc",
            background: "#2D3748",
            color: "#fff",
            fontFamily: "monospace",
            marginBottom: 16,
          }}
        />

        <p style={{ color: "#cbd5e0", fontSize: 12, marginTop: 12 }}>
          Premi <kbd>Esc</kbd> per confermare/uscire.
        </p>
      </div>
    </div>
  );
}
