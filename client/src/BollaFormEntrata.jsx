// File: BollaFormEntrata.jsx
import React, { useState, useEffect, useRef } from "react";
import { PDFDocument, StandardFonts } from "pdf-lib";


// === Leggi Prezzo Vendita da report.json ===
async function getPrezzoVenditaDaReport(commessa) {
  try {
    const folderPath = commessa?.percorso || commessa?.folderPath;
    if (!folderPath) return 0;
    const res = await fetch(
      `http://192.168.1.250:3001/api/report?folderPath=${encodeURIComponent(folderPath)}`
    );
    if (!res.ok) return 0;
    const data = await res.json();
    const val = data?.report?.prezzoVendita;
    const n = parseFloat(String(val).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

// Prendi il prossimo numero bolla entrata (senza T all’inizio) - GET
async function fetchNumeroBollaEntrata() {
  const response = await fetch("http://192.168.1.250:3001/api/prossima-bolla-entrata", {
    method: "GET",
  });
  if (!response.ok) throw new Error("Master PDF non trovato!");
  return await response.json();
}

// Avanza progressivo SOLO quando si stampa (senza T all’inizio)
async function avanzaNumeroBollaEntrata() {
  const response = await fetch("http://192.168.1.250:3001/api/avanza-bolla-entrata", {
    method: "POST",
  });
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
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(oggi.getDate())}-${pad(oggi.getMonth() + 1)}-${oggi.getFullYear()}`;
}

/* --------------------- NOVITÀ: helper codici --------------------- */
// C “visivo” per Excel colonna C (mantiene il trattino): es. "C8888-11"
function getCodiceVisivo(commessa) {
  if (commessa?.codiceCommessa) {
    const raw = String(commessa.codiceCommessa).trim();
    return raw.includes("_") ? raw.split("_").pop().trim() : raw;
  }
  if (commessa?.nome) {
    const m = String(commessa.nome).match(/_C([A-Za-z0-9\-]+)/);
    if (m) return "C" + m[1]; // preserva eventuale trattino
  }
  return "";
}

// Segmento per NOME FILE (con prefissi + underscore + trattino)
// es: "BBB_dvdvd_P_C8888-11"
function getSegmentoNomeFile(commessa) {
  if (commessa?.nome) return String(commessa.nome).trim();
  const b = (commessa?.brand || "").trim();
  const n = (commessa?.nomeProdotto || "").trim();
  const p = (commessa?.codiceProgetto || "").trim();
  const c = getCodiceVisivo(commessa);
  return [b, n, p, c].filter(Boolean).join("_");
}
/* ---------------------------------------------------------------- */

// Funzione per salvare il PDF nel backend nella sotto-cartella MATERIALI
async function salvaBollaNelBackend({ folderPath, fileName, pdfBlob }) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = async () => {
      const pdfData = reader.result;
      try {
        const r = await fetch("http://192.168.1.250:3001/api/save-pdf-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderPath, pdfData, fileName }),
        });
        if (r.status === 409) {
          // già creato da un altro trigger: la trattiamo come “ok”
          resolve();
        } else if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          reject(new Error(data.message || 'Errore salvataggio PDF'));
        } else {
          resolve();
        }

      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(pdfBlob);
  });
}

/* === PATCH: controlla se bolla entrata già presente (match su segmento o C visivo) === */
async function checkBollaEntrataGiaGenerata(materialiPath, segmentoCommessa, codiceVisivo) {
  try {
    const res = await fetch("http://192.168.1.250:3001/api/lista-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderPath: materialiPath }),
    });
    if (!res.ok) return false;
    const files = await res.json();
    const nomi = Array.isArray(files)
      ? files.map((f) => (typeof f === "string" ? f : f?.name || f?.Nome || ""))
      : [];
    return nomi.some((f) => {
      if (typeof f !== "string") return false;
      const low = f.toLowerCase();
      const isDDT = low.startsWith("ddt_") || low.startsWith("bolla_");
      const hasW = /[0-9]{4}W_/.test(f);
      const pdf = low.endsWith(".pdf");
      const hit = f.includes(segmentoCommessa) || (codiceVisivo && f.includes(codiceVisivo));
      return isDDT && hasW && pdf && hit;
    });
  } catch {
    return false;
  }
}

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
      ? files.map((f) => (typeof f === "string" ? f : f?.name || f?.Nome || ""))
      : [];
    nomi = nomi.filter(
      (f) =>
        typeof f === "string" &&
        (f.toLowerCase().startsWith("ddt_") || f.toLowerCase().startsWith("bolla_")) &&
        !f.toLowerCase().includes("entrata") &&
        f.toLowerCase().endsWith(".pdf")
    );
    if (!nomi.length) return null;
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

async function getColliDaReport(folderPath, fallbackColli) {
  try {
    const res = await fetch(
      `http://192.168.1.250:3001/api/report?folderPath=${encodeURIComponent(folderPath)}`
    );
    if (!res.ok) return fallbackColli;
    const data = await res.json();
    const report = data.report;
    if (report && Array.isArray(report.consegne) && report.consegne.length > 0) {
      let somma = 0;
      for (const consegna of report.consegne) {
        if (Array.isArray(consegna.bancali) && consegna.bancali.length > 0) {
          somma += consegna.bancali.reduce(
            (tot, b) => tot + (parseInt(b.quantiBancali) || 0),
            0
          );
        }
      }
      if (somma > 0) return somma;
    }
    return fallbackColli;
  } catch {
    return fallbackColli;
  }
}

// PATCH: Somma ore lavorate dal report produzione (report.json)
async function calcolaOreLavorate(folderPath) {
  try {
    const res = await fetch(
      `http://192.168.1.250:3001/api/report?folderPath=${encodeURIComponent(folderPath)}`
    );
    if (!res.ok) return "";
    const data = await res.json();
    const report = data.report;
    if (report && Array.isArray(report.dettagliProduzione)) {
      return report.dettagliProduzione.reduce(
        (tot, gg) => tot + (parseFloat(gg.totaleOreGG) || 0),
        0
      );
    }
    return "";
  } catch {
    return "";
  }
}

export default function BollaFormEntrata({ onClose, commessa, reportDdtPath }) {
  const [masterPDF, setMasterPDF] = useState(null);
  const [pdfFieldList, setPdfFieldList] = useState([]);
  const [formValues, setFormValues] = useState({});
  const [numeroBolla, setNumeroBolla] = useState("");
  const [loading, setLoading] = useState(true);
  const [autoMode, setAutoMode] = useState(false);
  const autoOnce = useRef(false);

  const oggiIT = new Date().toLocaleDateString("it-IT");

  useEffect(() => {
    let isMounted = true;
    async function setupForm() {
      setLoading(true);
      let numeroPuro = "";
      try {
        const data = await fetchNumeroBollaEntrata();
        if (data && data.numeroBolla) numeroPuro = String(data.numeroBolla);
      } catch {}
      setNumeroBolla(numeroPuro);

      try {
        const arrayBuffer = await fetchMasterBollaEntrata();
        if (!isMounted) return;
        setMasterPDF(arrayBuffer);

        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const form = pdfDoc.getForm();
        const fields = form.getFields();
        const lista = fields.map((f) => ({ name: f.getName(), type: f.constructor.name }));
        setPdfFieldList(lista);

        let campiAuto = {};
        let colliValue = "";
        if (commessa && (commessa.percorso || commessa.folderPath)) {
          const base = commessa.percorso || commessa.folderPath;
          const materialiPath = base + "/MATERIALI";
          const ultimoDDT = await getUltimoDDT(materialiPath);

          const fallbackColli = Array.isArray(commessa.materiali)
            ? commessa.materiali.filter(
                (m) => m.Descrizione && m.Descrizione.trim() !== ""
              ).length
            : "";

          colliValue = await getColliDaReport(base, fallbackColli);

          // Se TROVA un DDT di uscita => popola campi riferimento uscita
          if (ultimoDDT) {
            let numeroDDT = "";
            let dataDDT = "";
            const m =
              ultimoDDT.match(
                /^DDT?_([A-Za-z0-9]+[WT]?)_C?[A-Za-z0-9]*_(\d{2})-(\d{2})-(\d{4})\.pdf$/i
              ) ||
              ultimoDDT.match(
                /_([A-Za-z0-9]+[WT]?)_C?[A-Za-z0-9]*_(\d{2})-(\d{2})-(\d{4})\.pdf$/i
              );
            if (m) {
              numeroDDT = m[1];
              dataDDT = `${m[2]}/${m[3]}/${m[4]}`;
            }
            campiAuto = {
              "Ns DDT": numeroDDT,
              del: dataDDT,
              Testo8: dataDDT,
              Testo9: dataDDT,
              Descrizione: "Assembraggio " + (commessa?.nome || ""),
              qta: commessa?.quantita || "",
              colli: colliValue,
            };

          } else {
            // Se NON trova il DDT di uscita => lascia vuoti i campi legati all’uscita
            campiAuto = {
              "Ns DDT": "",
              del: "",
              // fallback OGGI quando manca la T (allineato all’automatica)
              Testo8: oggiIT,
              Testo9: oggiIT,
              Descrizione: "Assembraggio " + (commessa?.nome || ""),
              qta: commessa?.quantita || "",
              colli: colliValue,
            };

          }
        }

        const defaultVals = {};
        lista.forEach((f) => {
          const lname = f.name.toLowerCase();
          if (Object.prototype.hasOwnProperty.call(campiAuto, f.name)) {
            defaultVals[f.name] = String(campiAuto[f.name] ?? "");
          } else if (lname.includes("numero documento")) {
            defaultVals[f.name] = numeroPuro + "W";
          } else if (lname.includes("data documento")) {
            // Data Documento: oggi (documento di ENTRATA, non dipende dalla bolla di uscita)
            defaultVals[f.name] = oggiIT;
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
    return () => {
      isMounted = false;
    };
  }, [commessa]);

  // Generazione automatica: appena pronto e flag attivo, parte una sola volta
  useEffect(() => {
    if (!autoMode) return;
    if (autoOnce.current) return;
    if (!loading && masterPDF && pdfFieldList.length > 0) {
      autoOnce.current = true;
      handleGeneraPDF(new Event("submit"));
    }
  }, [autoMode, loading, masterPDF, pdfFieldList]);

  const handleChange = (name, val) => {
    setFormValues((fv) => ({ ...fv, [name]: val }));
  };

  // PATCH: aggiorna excel includendo le ore lavorate sommate dal report produzione
  const handleUpdateWorkExcel = async () => {
    if (!reportDdtPath) {
      alert("Percorso report DDT non configurato!");
      return;
    }
    const pathBase = commessa.percorso || commessa.folderPath;
    const materialiPath = pathBase ? pathBase + "/MATERIALI" : null;

    const codiceVisivo = getCodiceVisivo(commessa);     // "C8888-11"
    // NON usiamo più il segmento lungo per il nome file
    const commessaStr = codiceVisivo;                   // uniformiamo al formato T

    const numeroDdt = numeroBolla + "W";
    const dataDdt = oggiStr().replace(/-/g, "/");
    const quantita = commessa?.quantita || "";
    const colli = formValues["colli"] || "";
    const nsDdt = formValues["Ns DDT"] || "";
    const del = formValues["del"] || "";
    const percorsoPdf = materialiPath
      ? materialiPath + "\\" + `DDT_${numeroBolla}W_${commessaStr}_${oggiStr()}.pdf`
      : "";

    const oreLavorazione = await calcolaOreLavorate(pathBase);
    const prezzoVendita = await getPrezzoVenditaDaReport(commessa);

    const datiDdt = {
      dataDdt,
      numeroDdt,
      codiceCommessa: codiceVisivo, // ✅ Excel col. C con trattino
      quantita,
      colli,
      nsDdt,
      del,
      percorsoPdf,
      oreLavorazione: oreLavorazione,
      costoPz: "",
      costoTot: "",
      folderPath: commessa.percorso || commessa.folderPath,
      descrizione: formValues["Descrizione"] || "",
      nomeCommessa: commessa?.nome || "",
      prezzoVendita: prezzoVendita ?? 0,
    };

    try {
      const res = await fetch("http://192.168.1.250:3001/api/genera-ddt-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportDdtPath: reportDdtPath,
          datiDdt: datiDdt,
        }),
      });

      let msg = "Excel aggiornato correttamente!";
      let debugText = "";

      try {
        const data = await res.json();
        if (!res.ok) {
          msg = data.message || data.error || "Errore nella generazione del file Excel!";
          debugText = JSON.stringify(data, null, 2);
        } else if (data.message) {
          msg = data.message;
          if (data.debug) debugText = data.debug;
        }
      } catch (e) {
        if (!res.ok) msg = "Errore nella generazione del file Excel!";
      }

      if (!res.ok || debugText) {
        const testoFinale = msg + (debugText ? "\n\n--- DEBUG ---\n" + debugText : "");
        if (window.navigator && window.navigator.clipboard) {
          if (window.confirm(testoFinale + "\n\nVuoi copiare il debug negli appunti?")) {
            window.navigator.clipboard.writeText(testoFinale);
            alert("Debug copiato!");
          }
        } else {
          window.prompt("Debug (CTRL+C per copiare):", testoFinale);
        }
      } else {
        alert(msg);
      }
    } catch (e) {
      window.prompt(
        "Errore nella chiamata al server! (Copia e incolla se vuoi girarmelo)",
        e.message || String(e)
      );
    }
  };

  async function handleGeneraPDF(e) {
    e?.preventDefault?.();

    const pathBase = commessa.percorso || commessa.folderPath;
    const materialiPath = pathBase ? pathBase + "/MATERIALI" : null;

    // ⛔ Niente blocchi: la W si genera comunque

    if (!masterPDF || pdfFieldList.length === 0) {
      alert("PDF master non caricato o senza campi!");
      return;
    }

    const commessaStr = getCodiceVisivo(commessa);      // es: "C8888-11"

    if (materialiPath) {
      const esisteGia = await checkBollaEntrataGiaGenerata(materialiPath, commessaStr, commessaStr);

      if (esisteGia) {
        alert(
          "⚠️ Attenzione: la bolla di ENTRATA per questa commessa è già stata generata!\nNon puoi crearne una doppia."
        );
        onClose?.();
        return;
      }
    }

    let nuovoNumeroPuro = numeroBolla;
    try {
      const data = await avanzaNumeroBollaEntrata();
      if (data && data.numeroBolla) {
        nuovoNumeroPuro = String(data.numeroBolla);
        setNumeroBolla(nuovoNumeroPuro);
      }
    } catch {}

    let finalFormVals = { ...formValues };
    pdfFieldList.forEach((f) => {
      if (f.name.toLowerCase().includes("numero documento")) {
        finalFormVals[f.name] = nuovoNumeroPuro + "W";
      }
    });

    const nomeCommessa = commessa?.nome || "";
    const descrizioneStandard = "Assembraggio " + nomeCommessa;
    const quantita = commessa?.quantita || "";

    const pdfDoc = await PDFDocument.load(masterPDF);
    const form = pdfDoc.getForm();
    const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);

    pdfFieldList.forEach(({ name }) => {
      if (name === "Descrizione") {
        try {
          const tf = form.getTextField(name);

          // Forza singola riga (se il template fosse multilinea)
          tf.disableMultiline?.();

          // larghezza utile campo (fallback se API assente)
          const widget = tf.acroField.getWidgets()[0];
          let fieldWidth = 220;
          try {
            const r = widget.getRectangle ? widget.getRectangle() : widget.getRect?.();
            fieldWidth = Array.isArray(r) ? Math.abs(r[2] - r[0]) : (r?.width ?? fieldWidth);
          } catch {}
          const maxWidth = fieldWidth - 4;

          const testo = descrizioneStandard;
          let size = 14;
          const minSize = 5;
          while (size > minSize && helv.widthOfTextAtSize(testo, size) > maxWidth) {
            size -= 0.5;
          }

          tf.setText(testo);
          tf.setFontSize?.(size);
        } catch {}
      } else if (name === "qta") {
        try { form.getTextField(name).setText(String(quantita)); } catch {}
      } else if (name === "colli") {
        try { form.getTextField(name).setText(String(formValues["colli"] ?? "")); } catch {}
      } else {
        try { form.getTextField(name).setText(finalFormVals[name] || ""); } catch {}
      }
    });

    // rigenera le appearance con il font scelto (necessario per font-size dinamico)
    try { form.updateFieldAppearances(helv); } catch {}

    const dataFile = oggiStr();
    const nomeFile = `DDT_${nuovoNumeroPuro}W_${commessaStr}_${dataFile}.pdf`; // ✅ filename "ricco" come da regex Python

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: "application/pdf" });

    // download locale
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nomeFile;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 500);
    } catch {}

    // salva su MATERIALI
    if (materialiPath) {
      try {
        await salvaBollaNelBackend({
          folderPath: materialiPath,
          fileName: nomeFile,
          pdfBlob: blob,
        });
      } catch (e) {
        alert(
          "⚠️ Non sono riuscito a salvare la bolla di entrata sul server nella cartella MATERIALI."
        );
      }
    }

    // Log Excel DDT
    try {
      const oreLavorazione = await calcolaOreLavorate(pathBase);
      const prezzoVendita = await getPrezzoVenditaDaReport(commessa);

      await logDdtEntrata({
        reportDdtPath: reportDdtPath,
        dataDdt: oggiStr().replace(/-/g, "/"),
        numeroDdt: nuovoNumeroPuro + "W",
        codiceCommessa: commessaStr,  // ✅ Excel col. C corretto

        quantita: quantita,
        colli: formValues["colli"] || "",
        nsDdt: formValues["Ns DDT"] || "",
        del: formValues["del"] || "",
        percorsoPdf: materialiPath ? materialiPath + "\\" + nomeFile : "",
        oreLavorazione: oreLavorazione,
        costoPz: "",
        costoTot: "",
        prezzoVendita: prezzoVendita ?? 0,
      });
    } catch (err) {
      console.error("Errore log DDT entrata:", err);
    }
  }

  async function logDdtEntrata({
    reportDdtPath,
    dataDdt,
    numeroDdt,
    codiceCommessa,
    quantita,
    colli,
    nsDdt,
    del,
    percorsoPdf,
    oreLavorazione,
    costoPz,
    costoTot,
    prezzoVendita,
  }) {
    try {
      await fetch("http://192.168.1.250:3001/api/genera-ddt-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportDdtPath,
          dataDdt,
          numeroDdt,
          codiceCommessa,
          quantita,
          colli,
          nsDdt,
          del,
          percorsoPdf,
          oreLavorazione,
          costoPz,
          costoTot,
          folderPath: commessa.percorso || commessa.folderPath,
          descrizione: formValues["Descrizione"] || "",
          nomeCommessa: commessa?.nome || "",
          prezzoVendita: prezzoVendita ?? 0,
        }),
      });
    } catch (err) {
      alert("⚠️ Errore salvataggio registro DDT:\n" + err.message);
    }
  }

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
        overflow: "auto",
      }}
    >
      <h2 style={{ margin: 0, fontSize: "2rem", color: "#222" }}>
        Stai creando una{" "}
        <span style={{ color: "#004C84", fontWeight: "bold" }}>Bolla di Entrata</span>
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
              overflow: "auto",
            }}
            onSubmit={handleGeneraPDF}
            id="bollaEntrataForm"
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 18,
                marginBottom: 15,
                borderBottom: "1px solid #eee",
                paddingBottom: 12,
              }}
            >
              {pdfFieldList.map((field) => (
                <div
                  key={field.name}
                  style={{ flex: "1 1 240px", minWidth: 220, marginBottom: 10 }}
                >
                  <label style={{ fontWeight: 500 }}>{field.name}</label>
                  <input
                    value={formValues[field.name] || ""}
                    onChange={(e) => handleChange(field.name, e.target.value)}
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
                      field.name === "colli"
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
              alignItems: "center",
            }}
          >
            <label style={{ marginRight: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={autoMode}
                onChange={(e) => setAutoMode(e.target.checked)}
              />
              Generazione automatica
            </label>

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

            <button
              type="button"
              onClick={handleUpdateWorkExcel}
              style={{
                background: "#ffa800",
                color: "#fff",
                border: "none",
                borderRadius: "10px",
                padding: "12px 28px",
                fontWeight: "bold",
                fontSize: "1.05rem",
                cursor: "pointer",
                marginLeft: "10px",
              }}
            >
              Aggiorna Work
            </button>
          </div>
        </>
      )}
    </div>
  );
}
