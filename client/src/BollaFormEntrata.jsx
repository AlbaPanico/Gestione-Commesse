import React, { useState, useEffect } from "react";
import { PDFDocument } from "pdf-lib";

// Prendi il prossimo numero bolla entrata (senza T all’inizio)
async function fetchNumeroBollaEntrata() {
  const response = await fetch("http://192.168.1.250:3001/api/prossima-bolla-entrata", { method: "POST" });
  if (!response.ok) throw new Error("Master PDF non trovato!");
  return await response.json();
}

// Avanza progressivo SOLO quando si stampa (senza T all’inizio)
async function avanzaNumeroBollaEntrata() {
  const response = await fetch("http://192.168.1.250:3001/api/avanza-bolla-entrata", { method: "POST" });
  if (!response.ok) throw new Error("Errore avanzamento progressivo!");
  return await response.json();
}

// Scarica il master PDF di entrata
async function fetchMasterBollaEntrata() {
  const response = await fetch("http://192.168.1.250:3001/api/master-bolla?tipo=entrata");
  if (!response.ok) throw new Error("Master PDF non trovato!");
  return await response.arrayBuffer();
}

function oggiStr() {
  const oggi = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${pad(oggi.getDate())}-${pad(oggi.getMonth() + 1)}-${oggi.getFullYear()}`;
}

// Funzione per salvare il PDF nel backend nella sotto-cartella MATERIALI
async function salvaBollaNelBackend({ folderPath, fileName, pdfBlob }) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = async () => {
      const pdfData = reader.result; // Data URI base64
      try {
        await fetch("http://192.168.1.250:3001/api/save-pdf-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderPath, pdfData, fileName }),
        });
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(pdfBlob);
  });
}

// --- FUNZIONE DI CONTROLLO PRESENZA BOLLA USCITA ---
async function checkPresenzaBollaUscita(materialiPath) {
  try {
    const res = await fetch("http://192.168.1.250:3001/api/lista-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderPath: materialiPath }),
    });
    if (!res.ok) return false;
    const files = await res.json();
    const nomi = Array.isArray(files)
      ? files.map(f => typeof f === "string" ? f : (f.name || f.Nome || ""))
      : [];
    return nomi.some(f =>
      typeof f === "string" &&
      (
        f.toLowerCase().startsWith("bolla_") ||
        f.toLowerCase().startsWith("ddt_")
      ) &&
      !f.toLowerCase().includes("entrata") &&
      f.toLowerCase().endsWith(".pdf")
    );
  } catch (e) {
    return false;
  }
}

// Controlla se esiste già una bolla/entrata per la commessa
async function checkBollaEntrataGiaGenerata(materialiPath, codiceCommessa) {
  try {
    const res = await fetch("http://192.168.1.250:3001/api/lista-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderPath: materialiPath }),
    });
    if (!res.ok) return false;
    const files = await res.json();
    const nomi = Array.isArray(files)
      ? files.map(f => typeof f === "string" ? f : (f.name || f.Nome || ""))
      : [];
    // Cerca DDT_***W_*_codiceCommessa oppure Bolla_***W_*_codiceCommessa
    return nomi.some(f =>
      typeof f === "string" &&
      (
        f.toLowerCase().startsWith("ddt_") ||
        f.toLowerCase().startsWith("bolla_")
      ) &&
      f.includes(codiceCommessa) &&
      /[0-9]{4}W_/.test(f) && // cerca il progressivo con la W finale (es: 0017W_)
      f.toLowerCase().endsWith(".pdf")
    );
  } catch {
    return false;
  }
}

// Funzione per recuperare l'ultimo DDT (per numero e data da mettere in Ns DDT e del)
async function getUltimoDDT(materialiPath) {
  try {
    const res = await fetch("http://192.168.1.250:3001/api/lista-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderPath: materialiPath }),
    });
    if (!res.ok) return null;
    const files = await res.json();
    let nomi = Array.isArray(files)
      ? files.map(f => typeof f === "string" ? f : (f.name || f.Nome || ""))
      : [];
    nomi = nomi.filter(f =>
      typeof f === "string" &&
      (f.toLowerCase().startsWith("ddt_") || f.toLowerCase().startsWith("bolla_")) &&
      !f.toLowerCase().includes("entrata") &&
      f.toLowerCase().endsWith(".pdf")
    );
    if (!nomi.length) return null;
    // Ordina per data nel nome file (es: DDT_0017T_C4865_23-07-2025.pdf)
    nomi.sort((a, b) => {
      const dateA = a.match(/(\d{2})-(\d{2})-(\d{4})/);
      const dateB = b.match(/(\d{2})-(\d{2})-(\d{4})/);
      if (dateA && dateB) {
        const da = new Date(`${dateA[3]}-${dateA[2]}-${dateA[1]}`);
        const db = new Date(`${dateB[3]}-${dateB[2]}-${dateB[1]}`);
        return db - da;
      }
      return 0;
    });
    return nomi[0];
  } catch {
    return null;
  }
}

// Funzione che legge i colli da report consegne (sommando tutti i bancali)
// Se non ci sono bancali/consegne, ritorna null
async function getColliDaReport(folderPath, fallbackColli) {
  try {
    const reportPath = folderPath + "/report.json";
    const res = await fetch(`http://192.168.1.250:3001/api/report?folderPath=${encodeURIComponent(folderPath)}`);
    if (!res.ok) return fallbackColli;
    const data = await res.json();
    const report = data.report;
    if (report && Array.isArray(report.consegne) && report.consegne.length > 0) {
      let somma = 0;
      for (const consegna of report.consegne) {
        if (Array.isArray(consegna.bancali) && consegna.bancali.length > 0) {
          somma += consegna.bancali.reduce((tot, b) => tot + (parseInt(b.quantiBancali) || 0), 0);
        }
      }
      if (somma > 0) return somma;
    }
    return fallbackColli; // Se non ci sono consegne/bancali, usa fallback
  } catch {
    return fallbackColli;
  }
}

export default function BollaFormEntrata({ onClose, commessa }) {
  const [masterPDF, setMasterPDF] = useState(null);
  const [pdfFieldList, setPdfFieldList] = useState([]);
  const [formValues, setFormValues] = useState({});
  const [numeroBolla, setNumeroBolla] = useState(""); // solo numero puro
  const [loading, setLoading] = useState(true);
  const oggi = new Date().toLocaleDateString('it-IT');

  useEffect(() => {
    let isMounted = true;
    async function setupForm() {
      setLoading(true);
      let numeroPuro = "";
      try {
        const data = await fetchNumeroBollaEntrata();
        if (data && data.numeroBolla) numeroPuro = String(data.numeroBolla); // senza T
      } catch {}
      setNumeroBolla(numeroPuro);

      try {
        const arrayBuffer = await fetchMasterBollaEntrata();
        if (!isMounted) return;
        setMasterPDF(arrayBuffer);

        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const form = pdfDoc.getForm();
        const fields = form.getFields();
        const lista = fields.map(f => ({ name: f.getName(), type: f.constructor.name }));
        setPdfFieldList(lista);

        // === COMPILAZIONE AUTOMATICA DI TUTTI I CAMPI (FRONTEND) ===
        let campiAuto = {};
        let colliValue = "";
        if (commessa && (commessa.percorso || commessa.folderPath)) {
          const materialiPath = (commessa.percorso || commessa.folderPath) + "/MATERIALI";
          const ultimoDDT = await getUltimoDDT(materialiPath);

          // Default fallback per colli: conteggio da materiali commessa
          let fallbackColli = Array.isArray(commessa.materiali)
            ? commessa.materiali.filter(m => m.Descrizione && m.Descrizione.trim() !== "").length
            : "";

          // PROVA A LEGGERE I COLLI DA REPORT CONSEGNE
          colliValue = await getColliDaReport(commessa.percorso || commessa.folderPath, fallbackColli);

          if (ultimoDDT) {
            let numeroDDT = "";
            let dataDDT = "";
            const m = ultimoDDT.match(/^DDT?_([A-Za-z0-9]+[WT]?)_C?[A-Za-z0-9]*_(\d{2})-(\d{2})-(\d{4})\.pdf$/i);
            if (m) {
              numeroDDT = m[1];
              dataDDT = `${m[2]}/${m[3]}/${m[4]}`;
            } else {
              const m2 = ultimoDDT.match(/_([A-Za-z0-9]+[WT]?)_C?[A-Za-z0-9]*_(\d{2})-(\d{2})-(\d{4})\.pdf$/i);
              if (m2) {
                numeroDDT = m2[1];
                dataDDT = `${m2[2]}/${m2[3]}/${m2[4]}`;
              }
            }
            campiAuto = {
              "Ns DDT": numeroDDT,
              "del": dataDDT,
              "Testo8": dataDDT,
              "Testo9": dataDDT,
              "Descrizione": "Assembraggio " + (commessa?.nome || ""),
              "qta": commessa?.quantita || "",
              "colli": colliValue
            };
          } else {
            campiAuto = {
              "Descrizione": "Assembraggio " + (commessa?.nome || ""),
              "qta": commessa?.quantita || "",
              "Testo8": oggi,
              "Testo9": oggi,
              "colli": colliValue
            };
          }
        }

        // Crea i valori di default per ogni campo trovato nel pdf
        const defaultVals = {};
        lista.forEach(f => {
          const lname = f.name.toLowerCase();
          if (campiAuto.hasOwnProperty(f.name)) {
            defaultVals[f.name] = campiAuto[f.name];
          } else if (lname.includes("numero documento")) {
            defaultVals[f.name] = numeroPuro + "W";
          } else if (lname.includes("data documento")) {
            defaultVals[f.name] = oggi;
          } else {
            defaultVals[f.name] = "";
          }
        });
        setFormValues(defaultVals);

      } catch {
        if (isMounted) alert("Errore nel caricamento del PDF master o dei dati automatici!");
      }
      if (isMounted) setLoading(false);
    }
    setupForm();
    return () => { isMounted = false; };
  }, [commessa]);

  const handleChange = (name, val) => {
    setFormValues(fv => ({ ...fv, [name]: val }));
  };

  // GENERA PDF, scarica, e salva su server nella cartella MATERIALI
  async function handleGeneraPDF(e) {
    e.preventDefault();
    if (!masterPDF || pdfFieldList.length === 0) {
      alert("PDF master non caricato o senza campi!");
      return;
    }

    // Salvataggio in MATERIALI
    const pathBase = commessa.percorso || commessa.folderPath;
    const materialiPath = pathBase ? pathBase + "/MATERIALI" : null;

    // === BLOCCO GENERAZIONE SE ESISTE GIA UNA BOLLA PER LA COMMESSA ===
    // Ricava codice commessa
    let codiceCommessa = "";
    if (commessa?.codiceCommessa) {
      codiceCommessa = String(commessa.codiceCommessa).replace(/[^a-zA-Z0-9]/g, "");
    } else if (commessa?.nome) {
      const match = commessa.nome.match(/_C([a-zA-Z0-9]+)$/);
      codiceCommessa = match ? "C" + match[1] : commessa.nome;
    }
    if (materialiPath) {
  const esisteGia = await checkBollaEntrataGiaGenerata(materialiPath, codiceCommessa);
  if (esisteGia) {
    alert("⚠️ Attenzione: la bolla di ENTRATA per questa commessa è già stata generata!\Non puoi crearne una doppia.");
    onClose();
    return;
  }
}
    // Avanza progressivo!
    let nuovoNumeroPuro = numeroBolla;
    try {
      const data = await avanzaNumeroBollaEntrata();
      if (data && data.numeroBolla) {
        nuovoNumeroPuro = String(data.numeroBolla); // senza T
        setNumeroBolla(nuovoNumeroPuro);
      }
    } catch {}

    // Aggiorna il campo "numero documento"
    let finalFormVals = { ...formValues };
    pdfFieldList.forEach(f => {
      if (f.name.toLowerCase().includes("numero documento")) {
        finalFormVals[f.name] = nuovoNumeroPuro + "W"; // solo W finale!
      }
    });

    // --- Qui compiliamo i materiali ---
    const nomeCommessa = commessa?.nome || "";
    const descrizioneStandard = "Assembraggio " + nomeCommessa;
    const quantita = commessa?.quantita || "";

    const pdfDoc = await PDFDocument.load(masterPDF);
    const form = pdfDoc.getForm();

    // Compila tutti i campi principali
    pdfFieldList.forEach(({ name }) => {
      if (name === "Descrizione") {
        try { form.getTextField(name).setText(descrizioneStandard); } catch {}
      } else if (name === "qta") {
        try { form.getTextField(name).setText(String(quantita)); } catch {}
      } else if (name === "Testo8" || name === "Testo9") {
        try { form.getTextField(name).setText(oggi); } catch {}
      } else if (name === "colli") {
        try { form.getTextField(name).setText(String(formValues["colli"])); } catch {}
      } else {
        try { form.getTextField(name).setText(finalFormVals[name] || ""); } catch {}
      }
    });

    // Nome file: DDT_{NUMERO}{W}_{CODICECOMMESSA}_{DATA}.pdf
    const dataFile = oggiStr();
    // --- Ricava codice commessa in modo sicuro ---
    // (riutilizziamo quello sopra)
    const nomeFile = `DDT_${nuovoNumeroPuro}W_${codiceCommessa}_${dataFile}.pdf`;

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: "application/pdf" });

    // Download locale
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeFile;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 500);

    if (materialiPath) {
      try {
        await salvaBollaNelBackend({
          folderPath: materialiPath,
          fileName: nomeFile,
          pdfBlob: blob,
        });
      } catch (e) {
        alert("⚠️ Non sono riuscito a salvare la bolla di entrata sul server nella cartella MATERIALI.");
      }
    }
  }

  // UI
  return (
    <div
      style={{
        background: "#fff",
        padding: "44px 34px",
        borderRadius: "22px",
        boxShadow: "0 8px 32px 0 rgba(0,0,0,0.10)",
        minWidth: "540px",
        maxWidth: 950,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        position: "relative",
        maxHeight: "92vh",
        overflow: "auto"
      }}
    >
      <h2 style={{ margin: 0, fontSize: "2rem", color: "#222" }}>
        Stai creando una <span style={{ color: "#004C84", fontWeight: "bold" }}>Bolla di Entrata</span>
      </h2>

      {loading || !masterPDF || pdfFieldList.length === 0 ? (
        <div style={{ margin: "32px 0", color: "#888" }}>
          <b>⚡ Attendere, caricamento modulo PDF...</b>
        </div>
      ) : (
        <>
          <form
            style={{
              width: "100%",
              marginTop: 20,
              flex: "1 1 auto",
              maxHeight: 470,
              overflow: "auto"
            }}
            onSubmit={handleGeneraPDF}
            id="bollaEntrataForm"
          >
            <div
              style={{
                display: "flex", flexWrap: "wrap", gap: 18, marginBottom: 15,
                borderBottom: "1px solid #eee", paddingBottom: 12
              }}
            >
              {pdfFieldList.map(field => (
                <div key={field.name} style={{ flex: "1 1 240px", minWidth: 220, marginBottom: 10 }}>
                  <label style={{ fontWeight: 500 }}>{field.name}</label>
                  <input
                    value={formValues[field.name] || ""}
                    onChange={e => handleChange(field.name, e.target.value)}
                    style={{
                      width: "100%",
                      padding: 9,
                      borderRadius: 7,
                      border: "1px solid #bbb",
                    }}
                    placeholder={field.name}
                    readOnly={
                      field.name.toLowerCase().includes("numero documento") ||
                      field.name.toLowerCase().includes("data documento") ||
                      field.name === "Descrizione" ||
                      field.name === "qta" ||
                      field.name === "colli" ||
                      field.name === "Ns DDT" ||
                      field.name === "del"
                    }
                  />
                </div>
              ))}
            </div>
          </form>
          <div
            style={{
              width: "100%",
              position: "sticky",
              bottom: 0,
              background: "#fff",
              borderTop: "1px solid #eee",
              padding: "18px 0 10px 0",
              display: "flex",
              justifyContent: "flex-end",
              gap: 14,
              zIndex: 100,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "#888",
                color: "#fff",
                border: "none",
                borderRadius: "10px",
                padding: "12px 34px",
                fontWeight: "bold",
                fontSize: "1.05rem",
                cursor: "pointer",
              }}
            >
              Torna alla scelta
            </button>
            <button
              type="submit"
              form="bollaEntrataForm"
              style={{
                background: "#004C84",
                color: "#fff",
                border: "none",
                borderRadius: "10px",
                padding: "12px 44px",
                fontWeight: "bold",
                fontSize: "1.15rem",
                cursor: "pointer",
              }}
            >
              Genera Bolla Entrata
            </button>
          </div>
        </>
      )}
    </div>
  );
}
