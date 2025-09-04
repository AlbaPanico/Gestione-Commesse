import React, { useState, useEffect } from "react";
import { PDFDocument } from "pdf-lib";

// Prende il prossimo numero bolla SENZA avanzarlo
async function fetchNumeroBolla() {
  const response = await fetch("http://192.168.1.250:3001/api/prossima-bolla", { method: "GET" });
  if (!response.ok) throw new Error("Master PDF non trovato!");
  return await response.json();
}

// Avanza il progressivo (SOLO quando si stampa)
async function avanzaNumeroBolla() {
  const response = await fetch("http://192.168.1.250:3001/api/avanza-bolla", { method: "POST" });
  if (!response.ok) throw new Error("Errore avanzamento progressivo!");
  return await response.json();
}

// Scarica il master PDF
async function fetchMasterBollaUscita() {
  const response = await fetch("http://192.168.1.250:3001/api/master-bolla?tipo=uscita");
  if (!response.ok) throw new Error("Master PDF non trovato!");
  return await response.arrayBuffer();
}

// Data IT in formato gg-mm-aaaa
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

// --- Controllo se esiste già una bolla uscita per questa commessa ---
async function checkBollaUscitaGiaGenerata(materialiPath, codiceCommessa) {
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
        f.toLowerCase().startsWith("ddt_") ||
        f.toLowerCase().startsWith("bolla_")
      ) &&
      f.includes(codiceCommessa) &&
      /[0-9]{4}T_/.test(f) && // progressivo T (es: 0017T_)
      !f.toLowerCase().includes("entrata") &&
      f.toLowerCase().endsWith(".pdf")
    );
  } catch {
    return false;
  }
}

export default function BollaFormUscita({ onClose, commessa }) {
  const [masterPDF, setMasterPDF] = useState(null);
  const [pdfFieldList, setPdfFieldList] = useState([]);
  const [formValues, setFormValues] = useState({});
  const [numeroBolla, setNumeroBolla] = useState("W");
  const [loading, setLoading] = useState(true);

  const oggi = new Date().toLocaleDateString('it-IT');

  // es: se nome = "HAIR RITUAL_BARRETTA LUMINOSA 30 CM_P_C4897A" => commessa = "C4897A"
  function estraiCommessa(nome) {
    if (!nome) return "";
    const pezzi = nome.split("_");
    return pezzi.length >= 4 ? pezzi[3].trim() : nome;
  }

  useEffect(() => {
    let isMounted = true;
    async function setupForm() {
      setLoading(true);
      let numeroConT = "T";
      try {
        const data = await fetchNumeroBolla();
        if (data && data.numeroBolla) numeroConT = `${data.numeroBolla}T`;
      } catch {}
      setNumeroBolla(numeroConT);

      let soloCommessa = "";
      if (commessa && commessa.nome) {
        soloCommessa = estraiCommessa(commessa.nome);
      }

      try {
        const arrayBuffer = await fetchMasterBollaUscita();
        if (!isMounted) return;
        setMasterPDF(arrayBuffer);

        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const form = pdfDoc.getForm();
        const fields = form.getFields();
        const lista = fields.map(f => ({ name: f.getName(), type: f.constructor.name }));
        setPdfFieldList(lista);

        // Valori di default
        const defaultVals = {};
        lista.forEach(f => {
          const lname = f.name.toLowerCase();
          if (lname.includes("numero documento")) defaultVals[f.name] = numeroConT;
          else if (lname.includes("data documento")) defaultVals[f.name] = oggi;
          else if (lname.includes("commessa")) defaultVals[f.name] = soloCommessa;
          else if (lname.includes("data trasporto")) defaultVals[f.name] = oggi;
          else if (lname.includes("data ritiro")) defaultVals[f.name] = oggi;
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
    if (name.startsWith("qta")) val = val.replace(/[^0-9]/g, "");
    setFormValues(fv => ({ ...fv, [name]: val }));
  };

  // GENERA PDF, scarica, e salva su server nella cartella MATERIALI
  async function handleGeneraPDF(e) {
    e.preventDefault();
    if (!masterPDF || pdfFieldList.length === 0) {
      alert("PDF master non caricato o senza campi!");
      onClose();
      return;
    }

    // Materiali
    const materiali = commessa && Array.isArray(commessa.materiali) ? commessa.materiali : [];

    // Primo controllo: nessun materiale
    if (!materiali.length) {
      alert("⚠️ ATTENZIONE:\n\nNessun materiale presente nella distinta!\nImpossibile generare la bolla.");
      onClose();
      return;
    }

    // Secondo controllo: almeno una descrizione vuota
    const descrizioneMancante = materiali.some(
      mat => !mat.Descrizione || String(mat.Descrizione).trim() === ""
    );
    if (descrizioneMancante) {
      alert("⚠️ ATTENZIONE:\n\nAlmeno una riga materiale ha il campo Descrizione vuoto!\nCompila tutte le descrizioni prima di generare la bolla.");
      onClose();
      return;
    }

    // --- Blocco: solo una bolla uscita per commessa (T) ---
    const pathBase = commessa.percorso || commessa.folderPath;
    const materialiPath = pathBase ? pathBase + "/MATERIALI" : null;
    const codiceCommessa = estraiCommessa(commessa && commessa.nome);

    if (materialiPath) {
      const esisteGia = await checkBollaUscitaGiaGenerata(materialiPath, codiceCommessa);
      if (esisteGia) {
        alert("⚠️ Attenzione: la bolla di USCITA per questa commessa è già stata generata!\nNon puoi crearne una doppia.");
        onClose();
        return;
      }
    }

    // Avanza ora il progressivo!
    let nuovoNumero = numeroBolla;
    try {
      const data = await avanzaNumeroBolla();
      if (data && data.numeroBolla) {
        nuovoNumero = `${data.numeroBolla}T`;
        setNumeroBolla(nuovoNumero);
      }
    } catch {}

    // Aggiorna il campo "numero documento"
    let finalFormVals = { ...formValues };
    pdfFieldList.forEach(f => {
      if (f.name.toLowerCase().includes("numero documento")) {
        finalFormVals[f.name] = nuovoNumero;
      }
    });

    const chunkSize = 18;
    const chunks = [];
    for (let i = 0; i < materiali.length; i += chunkSize) {
      chunks.push(materiali.slice(i, i + chunkSize));
    }
    if (chunks.length === 0) chunks.push([]);

    // Colli totale
    const totaleColli = materiali.filter(
      mat => mat.Descrizione && String(mat.Descrizione).trim() !== ""
    ).length;

    // Estrai codice commessa per nome file
    const commessaStr = estraiCommessa(commessa && commessa.nome);

    // Data in formato nome file
    const dataFile = oggiStr();

    const finalPdfDoc = await PDFDocument.create();

    for (let pageIdx = 0; pageIdx < chunks.length; pageIdx++) {
      const pdfDoc = await PDFDocument.load(masterPDF);
      const form = pdfDoc.getForm();

      pdfFieldList.forEach(({ name }) => {
        if (
          name.startsWith("codice.") ||
          name.startsWith("descrizione.") ||
          name.startsWith("qta.") ||
          name.toLowerCase().includes("pag") ||
          name === "colli"
        ) return;
        try { form.getTextField(name).setText(finalFormVals[name] || ""); } catch {}
      });

      chunks[pageIdx].forEach((mat, idx) => {
        try { form.getTextField(`codice.${idx}`).setText(mat.Cd_AR || ""); } catch {}
        try { form.getTextField(`descrizione.${idx}`).setText(mat.Descrizione || ""); } catch {}
        try {
          let qtaVal = mat.Qta != null ? String(Math.floor(Number(mat.Qta))) : "";
          form.getTextField(`qta.${idx}`).setText(qtaVal);
        } catch {}
      });
      for (let j = chunks[pageIdx].length; j < chunkSize; j++) {
        try { form.getTextField(`codice.${j}`).setText(""); } catch {}
        try { form.getTextField(`descrizione.${j}`).setText(""); } catch {}
        try { form.getTextField(`qta.${j}`).setText(""); } catch {}
      }

      // Campo colli
      try {
        form.getTextField("colli").setText(String(totaleColli));
      } catch {}

      // Numero pagina
      const pagField = pdfFieldList.find(f => f.name.toLowerCase().includes("pag"));
      if (pagField) {
        try {
          form.getTextField(pagField.name).setText(`${pageIdx + 1}/${chunks.length}`);
        } catch {}
      }

      form.flatten();
      const [page] = await finalPdfDoc.copyPages(pdfDoc, [0]);
      finalPdfDoc.addPage(page);
    }

    // Nome file come richiesto: DDT_"numero"_"commessa"_"data".pdf
    const nomeFile = `DDT_${nuovoNumero}_${commessaStr}_${dataFile}.pdf`;

    const pdfBytes = await finalPdfDoc.save();
    const blob = new Blob([pdfBytes], { type: "application/pdf" });

    // --- 1) Download locale per l'utente ---
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeFile;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 500);

    // --- 2) Salvataggio nella cartella MATERIALI del server ---
    if (materialiPath) {
      try {
        await salvaBollaNelBackend({
          folderPath: materialiPath,
          fileName: nomeFile,
          pdfBlob: blob,
        });
      } catch (e) {
        alert("⚠️ Non sono riuscito a salvare la bolla sul server nella cartella MATERIALI.");
      }
    }
  }

  // Tabella materiali
  function MaterialiTable() {
    const materiali = commessa && Array.isArray(commessa.materiali) ? commessa.materiali : [];
    const rows = [];
    for (let i = 0; i < Math.max(materiali.length, 18); i++) {
      const mat = materiali[i] || { Cd_AR: "", Descrizione: "", Qta: "" };
      rows.push({
        ...mat,
        Qta: mat.Qta != null && mat.Qta !== "" ? Math.floor(Number(mat.Qta)) : "",
      });
    }
    const totaleColli = materiali.filter(
      mat => mat.Descrizione && String(mat.Descrizione).trim() !== ""
    ).length;

    return (
      <>
        <table style={{
          width: "100%", margin: "0 0 8px 0", borderCollapse: "collapse",
          border: "1px solid #bbb", fontFamily: "inherit", fontSize: "1.08em"
        }}>
          <thead>
            <tr style={{ background: "#f4f4f4" }}>
              <th style={{ padding: 4, border: "1px solid #bbb" }}>Codice</th>
              <th style={{ padding: 4, border: "1px solid #bbb" }}>Descrizione</th>
              <th style={{ padding: 4, border: "1px solid #bbb" }}>Q.tà</th>
              <th style={{ padding: 4, border: "1px solid #bbb" }}>Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((mat, idx) => (
              <tr key={idx} style={{ background: idx % 2 === 1 ? "#fafafa" : "#fff" }}>
                <td style={{ padding: 4, border: "1px solid #bbb" }}>{mat.Cd_AR}</td>
                <td style={{ padding: 4, border: "1px solid #bbb" }}>{mat.Descrizione}</td>
                <td style={{ padding: 4, border: "1px solid #bbb", textAlign: "right" }}>{mat.Qta}</td>
                <td style={{ padding: 4, border: "1px solid #bbb" }}>{mat.NoteRiga || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{
          width: "100%",
          textAlign: "right",
          fontWeight: 700,
          fontSize: "1.07em",
          color: "#186",
          paddingBottom: 8,
          letterSpacing: "1.2px"
        }}>
          Totale colli: {totaleColli}
        </div>
        <div style={{
          width: "100%",
          textAlign: "right",
          color: "#004C84",
          fontWeight: "bold",
          fontSize: "1em"
        }}>
          Prossimo numero bolla: {numeroBolla}
        </div>
      </>
    );
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
        Stai creando una <span style={{ color: "#ff9800", fontWeight: "bold" }}>Bolla in Uscita</span>
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
            id="bollaForm"
          >
            <div
              style={{
                display: "flex", flexWrap: "wrap", gap: 18, marginBottom: 15,
                borderBottom: "1px solid #eee", paddingBottom: 12
              }}
            >
              {pdfFieldList.filter(field =>
                !field.name.startsWith("codice.") &&
                !field.name.startsWith("descrizione.") &&
                !field.name.startsWith("qta.") &&
                !field.name.toLowerCase().includes("pag")
              ).map(field => {
                // --- COLLI: mostralo come campo non editabile ---
                if (field.name === "colli") {
                  const materiali = commessa && Array.isArray(commessa.materiali) ? commessa.materiali : [];
                  const totaleColli = materiali.filter(
                    mat => mat.Descrizione && String(mat.Descrizione).trim() !== ""
                  ).length;
                  return (
                    <div key={field.name} style={{ flex: "1 1 120px", minWidth: 100, marginBottom: 10 }}>
                      <label style={{ fontWeight: 500 }}>{field.name}</label>
                      <input
                        value={totaleColli}
                        readOnly
                        style={{
                          width: "100%",
                          padding: 9,
                          borderRadius: 7,
                          border: "1px solid #bbb",
                          background: "#eee",
                          fontWeight: 700,
                          color: "#186"
                        }}
                      />
                    </div>
                  );
                }
                // --- FINE CAMPO COLLI ---

                // Data del trasporto o ritiro
                if (
                  field.name.toLowerCase().includes("data trasporto") ||
                  field.name.toLowerCase().includes("data ritiro")
                ) {
                  return (
                    <div key={field.name} style={{ flex: "1 1 240px", minWidth: 220, marginBottom: 10 }}>
                      <label style={{ fontWeight: 500 }}>{field.name}</label>
                      <input
                        value={oggi}
                        readOnly
                        style={{
                          width: "100%",
                          padding: 9,
                          borderRadius: 7,
                          border: "1px solid #bbb",
                          background: "#eee"
                        }}
                        placeholder={field.name}
                      />
                    </div>
                  );
                }
                // Gli altri campi
                return (
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
                        field.name.toLowerCase().includes("commessa")
                      }
                    />
                  </div>
                );
              })}
            </div>
            <MaterialiTable />
          </form>
          {/* Bottoni sticky in fondo */}
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
              form="bollaForm"
              style={{
                background: "#0e7f2e",
                color: "#fff",
                border: "none",
                borderRadius: "10px",
                padding: "12px 44px",
                fontWeight: "bold",
                fontSize: "1.15rem",
                cursor: "pointer",
              }}
            >
              Genera Bolla
            </button>
          </div>
        </>
      )}
    </div>
  );
}
