// src/NewSlide.jsx

import React, { useState, useRef, useEffect } from "react";

const SERVER = "http://192.168.1.250:3001";

// Funzione che costruisce SEMPRE il link giusto dal nome stampante
function buildJsonUnificatoLink(nomeStampante) {
  const cleaned = nomeStampante.trim().replace(/[\s]+/g, " ");
  return `${SERVER}/report_generale/Reportgenerali_${encodeURIComponent(cleaned)}.json`;
}

export default function NewSlide({
  onClose,
  printers: initialPrinters = [],
  monitorJsonPath = "",
  reportGeneralePath = "",
  storicoConsumiUrl = ""
}) {
  const [stampanti, setStampanti] = useState(initialPrinters);
  const [monitor, setMonitor] = useState(monitorJsonPath);
  const [reportGenerale, setReportGenerale] = useState(reportGeneralePath);
  const [storicoConsumi, setStoricoConsumi] = useState(storicoConsumiUrl);

  // Aggiunta stampante
  const [showAdd, setShowAdd] = useState(false);
  const [newAclLink, setNewAclLink] = useState("");
  const [newNome, setNewNome] = useState("");
  const [newCostoCMYK, setNewCostoCMYK] = useState("");
  const [newCostoW, setNewCostoW] = useState("");
  const [newCostoVernice, setNewCostoVernice] = useState("");
  const [editingIdx, setEditingIdx] = useState(-1);
  const [editAclLink, setEditAclLink] = useState("");
  const [editNome, setEditNome] = useState("");
  const [editCostoCMYK, setEditCostoCMYK] = useState("");
  const [editCostoW, setEditCostoW] = useState("");
  const [editCostoVernice, setEditCostoVernice] = useState("");
  const panelRef = useRef(null);

  // Gestione ESC
  useEffect(() => {
  const handleKey = e => {
    if (e.key === "Escape") saveSettingsAndClose();
  };
  window.addEventListener("keydown", handleKey);
  return () => window.removeEventListener("keydown", handleKey);
}, [stampanti, monitor, reportGenerale, storicoConsumi]);


  // Chiudi se clicchi fuori dal pannello
  const handleOverlayClick = e => {
    if (!panelRef.current?.contains(e.target)) saveSettingsAndClose();
  };

  // Salva impostazioni e chiudi
  const saveSettingsAndClose = () => {
  const monitorClean = monitor.replace(/"/g, "").trim();
  const reportClean = reportGenerale.replace(/"/g, "").trim();
  const storicoClean = storicoConsumi.replace(/"/g, "").trim();

  fetch(`${SERVER}/api/stampanti/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      printers: stampanti,
      monitorJsonPath: monitorClean,
      reportGeneralePath: reportClean,
      storicoConsumiUrl: storicoClean
    }),
  })
    .then(res => res.json())
    .then(() => {
      onClose({
  printers: stampanti,
  monitor: monitorClean,
  reportGenerale: reportClean,
  storicoConsumiUrl: storicoClean
});

    })
    .catch(err => {
      alert("Errore nel salvataggio delle impostazioni: " + err);
      onClose({
        printers: stampanti,
        monitor: monitorClean,
        reportGenerale: reportClean,
        storico: storicoClean
      });
    });
};


  // Aggiungi stampante all'elenco
  const handleAddStampante = () => {
    if (!newAclLink.trim() || !newNome.trim()) return;

    let link = buildJsonUnificatoLink(newNome);

    setStampanti(prev => [
      ...prev,
      {
        aclLink: newAclLink.trim(),
        nome: newNome.trim(),
        jsonUnificatoLink: link,
        costoCMYK: newCostoCMYK.trim(),
        costoW: newCostoW.trim(),
        costoVernice: newCostoVernice.trim()
      }
    ]);
    setNewAclLink("");
    setNewNome("");
    setNewCostoCMYK("");
    setNewCostoW("");
    setNewCostoVernice("");
    setShowAdd(false);
  };

  // Cancella stampante
  const handleRemoveStampante = idx => {
    setStampanti(prev => prev.filter((_, i) => i !== idx));
    if (editingIdx === idx) setEditingIdx(-1);
  };

  // Avvia la modifica
  const handleEdit = idx => {
    setEditingIdx(idx);
    setEditAclLink(stampanti[idx].aclLink || "");
    setEditNome(stampanti[idx].nome || "");
    setEditCostoCMYK(stampanti[idx].costoCMYK || "");
    setEditCostoW(stampanti[idx].costoW || "");
    setEditCostoVernice(stampanti[idx].costoVernice || "");
  };

  // Salva modifica
  const handleSaveEdit = idx => {
    if (!editAclLink.trim() || !editNome.trim()) return;
    let link = buildJsonUnificatoLink(editNome);
    setStampanti(prev =>
      prev.map((s, i) =>
        i === idx
          ? {
              aclLink: editAclLink.trim(),
              nome: editNome.trim(),
              jsonUnificatoLink: link,
              costoCMYK: editCostoCMYK.trim(),
              costoW: editCostoW.trim(),
              costoVernice: editCostoVernice.trim()
            }
          : s
      )
    );
    setEditingIdx(-1);
  };

  // Annulla modifica
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
        {/* Blocco ACL */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <label style={{ color: "#fff", flex: 1 }}>
            Incolla riferimenti stampanti:
          </label>
          <button
            onClick={() => setShowAdd(s => !s)}
            style={{
              background: "#2ecc40",
              color: "#fff",
              border: "none",
              borderRadius: "50%",
              width: 32,
              height: 32,
              fontSize: 22,
              marginLeft: 8,
              cursor: "pointer"
            }}
            title="Aggiungi stampante"
          >+</button>
        </div>

        {/* Lista stampanti già inserite con tasto cancella e mod */}
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
                        value={editAclLink}
                        onChange={e => setEditAclLink(e.target.value)}
                        placeholder="Link ACL (es: http://192.168.1.82/accounting)"
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
                        placeholder="Nome stampante (es: Arizona B)"
                        style={{
                          padding: 6,
                          borderRadius: 6,
                          border: "1px solid #ccc",
                          background: "#2D3748",
                          color: "#fff",
                          marginBottom: 4
                        }}
                      />
                      {/* Nuovi campi di costo EDIT */}
                      <input
                        value={editCostoCMYK}
                        onChange={e => setEditCostoCMYK(e.target.value)}
                        placeholder="Costo CMYK"
                        style={{
                          padding: 6,
                          borderRadius: 6,
                          border: "1px solid #ccc",
                          background: "#2D3748",
                          color: "#fff",
                          marginBottom: 4
                        }}
                        type="number"
                        min="0"
                        step="0.0001"
                      />
                      <input
                        value={editCostoW}
                        onChange={e => setEditCostoW(e.target.value)}
                        placeholder="Costo W"
                        style={{
                          padding: 6,
                          borderRadius: 6,
                          border: "1px solid #ccc",
                          background: "#2D3748",
                          color: "#fff",
                          marginBottom: 4
                        }}
                        type="number"
                        min="0"
                        step="0.0001"
                      />
                      <input
                        value={editCostoVernice}
                        onChange={e => setEditCostoVernice(e.target.value)}
                        placeholder="Costo Vernice"
                        style={{
                          padding: 6,
                          borderRadius: 6,
                          border: "1px solid #ccc",
                          background: "#2D3748",
                          color: "#fff",
                          marginBottom: 4
                        }}
                        type="number"
                        min="0"
                        step="0.0001"
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
                      {/* Bottoni PRIMA */}
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
                        title="Rimuovi stampante"
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
                      {/* Testo dopo */}
                      <div style={{ flex: 1 }}>
                        <b>{s.nome}:</b> {s.aclLink}
                        <br />
                        <span style={{ fontSize: 12, color: "#b5f4ff" }}>
                          Link JSON Unificato: {s.jsonUnificatoLink}
                        </span>
                        <br />
                        <span style={{ fontSize: 12, color: "#f3e8ff" }}>
                          Costo CMYK: <b>{s.costoCMYK || "-"}</b> | Costo W: <b>{s.costoW || "-"}</b> | Costo Vernice: <b>{s.costoVernice || "-"}</b>
                        </span>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Form di aggiunta */}
        {showAdd && (
          <div style={{
            background: "#374151",
            padding: 10,
            borderRadius: 6,
            marginBottom: 16,
            display: "flex",
            flexDirection: "column",
            gap: 8
          }}>
            <input
              autoFocus
              value={newAclLink}
              onChange={e => setNewAclLink(e.target.value)}
              placeholder="Link ACL (es: http://192.168.1.82/accounting)"
              style={{
                padding: 8,
                borderRadius: 6,
                border: "1px solid #ccc",
                background: "#2D3748",
                color: "#fff",
                fontFamily: "monospace",
              }}
            />
            <input
              value={newNome}
              onChange={e => setNewNome(e.target.value)}
              placeholder="Nome stampante (es: Arizona B)"
              style={{
                padding: 8,
                borderRadius: 6,
                border: "1px solid #ccc",
                background: "#2D3748",
                color: "#fff"
              }}
            />
            {/* Nuovi campi di costo AGGIUNTA */}
            <input
              value={newCostoCMYK}
              onChange={e => setNewCostoCMYK(e.target.value)}
              placeholder="Costo CMYK"
              style={{
                padding: 8,
                borderRadius: 6,
                border: "1px solid #ccc",
                background: "#2D3748",
                color: "#fff"
              }}
              type="number"
              min="0"
              step="0.0001"
            />
            <input
              value={newCostoW}
              onChange={e => setNewCostoW(e.target.value)}
              placeholder="Costo W"
              style={{
                padding: 8,
                borderRadius: 6,
                border: "1px solid #ccc",
                background: "#2D3748",
                color: "#fff"
              }}
              type="number"
              min="0"
              step="0.0001"
            />
            <input
              value={newCostoVernice}
              onChange={e => setNewCostoVernice(e.target.value)}
              placeholder="Costo Vernice"
              style={{
                padding: 8,
                borderRadius: 6,
                border: "1px solid #ccc",
                background: "#2D3748",
                color: "#fff"
              }}
              type="number"
              min="0"
              step="0.0001"
            />
            <button
              style={{
                marginLeft: 0,
                background: "#0074D9",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "8px 14px",
                cursor: "pointer"
              }}
              onClick={handleAddStampante}
              title="Salva stampante"
            >Salva</button>
          </div>
        )}

        {/* Percorso JSON monitoraggio */}
        <label style={{ color: "#fff", marginBottom: 8 }}>
          Incolla il percorso del file .json monitoraggio:
        </label>
        <input
          value={monitor}
          onChange={e => setMonitor(e.target.value)}
          placeholder="C:\\monitoraggio\\dati.json"
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

{/* Storico consumi energia (URL) */}
<label style={{ color: "#fff", marginBottom: 8 }}>
  Storico consumi energia (URL):
</label>
<input
  value={storicoConsumi}
  onChange={e => setStoricoConsumi(e.target.value)}
  placeholder="http://192.168.1.250:3000/storico"
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
