// src/utils/generaBollaEntrata.js

import { PDFDocument } from "pdf-lib";

// Utility per data odierna formato gg-mm-aaaa
function oggiStr() {
  const oggi = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${pad(oggi.getDate())}-${pad(oggi.getMonth() + 1)}-${oggi.getFullYear()}`;
}

// Utility per data odierna formato gg/mm/aaaa (per excel/log)
function oggiStrSlashed() {
  return oggiStr().replace(/-/g, "/");
}

// Prendi il prossimo numero bolla ENTRATA (SENZA avanzare)
async function fetchNumeroBollaEntrata() {
  const res = await fetch("http://192.168.1.250:3001/api/prossima-bolla-entrata", { method: "POST" });
  if (!res.ok) throw new Error("Errore fetch numero bolla entrata!");
  const data = await res.json();
  return data && data.numeroBolla ? String(data.numeroBolla) : "";
}

// Scarica il master PDF (entrata)
async function fetchMasterBollaEntrata() {
  const res = await fetch("http://192.168.1.250:3001/api/master-bolla?tipo=entrata");
  if (!res.ok) throw new Error("Errore master PDF entrata!");
  return await res.arrayBuffer();
}

// Calcola colli con logica IDENTICA alla manuale (come in BollaFormEntrata)
async function calcolaColli(folderPath, materiali = [], quantita = "") {
  try {
    const res = await fetch(`http://192.168.1.250:3001/api/report?folderPath=${encodeURIComponent(folderPath)}`);
    if (!res.ok) throw new Error("Report non trovato");
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
    // Se non ci sono bancali => conta i materiali compilati (come fa manuale)
    if (Array.isArray(materiali) && materiali.length > 0) {
      return materiali.filter(m => m.Descrizione && m.Descrizione.trim() !== "").length;
    }
    // Altrimenti, fallback alla quantità totale
    return quantita && Number(quantita) > 0 ? Number(quantita) : 1;
  } catch {
    // Se tutto fallisce, fallback a materiali.length > 0
    if (Array.isArray(materiali) && materiali.length > 0) {
      return materiali.filter(m => m.Descrizione && m.Descrizione.trim() !== "").length;
    }
    return quantita && Number(quantita) > 0 ? Number(quantita) : 1;
  }
}

// Recupera ultimo DDT di uscita
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

export async function generaBollaEntrataCompleta({
  commessa,
  materialiPath,
  reportDdtPath,
  materiali = []
})
 {

// 🔴 CONTROLLO PRESENZA DDT USCITA QUI
  const res = await fetch("http://192.168.1.250:3001/api/lista-file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderPath: materialiPath }),
  });
  const files = await res.json();
  const haBollaUscita = files.some(f => /DDT_\d{4}T_.*\.pdf$/i.test(f));
  if (!haBollaUscita) {
    alert("ATTENZIONE DDT In Entrata Mancante nella cartella MATERIALI!");
    return;
  }


  // 1. AVANZA il progressivo bolla ENTRATA, come manuale!
let numeroBolla = "";
try {
  const res = await fetch("http://192.168.1.250:3001/api/avanza-bolla-entrata", { method: "POST" });
  if (res.ok) {
    const data = await res.json();
    numeroBolla = data.numeroBolla ? String(data.numeroBolla) : "";
  }
} catch (e) {
  alert("Errore nel progressivo bolla di entrata: " + (e.message || e));
  return;
}


  // 2. Master PDF
  let masterPDF = null;
  try {
    masterPDF = await fetchMasterBollaEntrata();
  } catch (e) {
    alert("Errore: master PDF bolla ENTRATA non trovato!");
    return;
  }

  // 3. Colli (come manuale)
  let colliValue = await calcolaColli(commessa.percorso || commessa.folderPath, materiali, commessa?.quantita);

  // 4. Prendi ultimo DDT di uscita, SOLO per "Ns DDT" e "del"
  let ultimoDDT = await getUltimoDDT(materialiPath);
  let campiAuto = {};
  const oggi = oggiStr();
  const oggiSlash = oggiStrSlashed();
  if (ultimoDDT) {
    let numeroDDT = "";
    let dataDDT = "";
    const m = ultimoDDT.match(/^DDT?_([A-Za-z0-9]+[WT]?)_C?[A-Za-z0-9]*_(\d{2})-(\d{2})-(\d{4})\.pdf$/i);
    if (m) {
      numeroDDT = m[1];
      dataDDT = `${m[2]}/${m[3]}/${m[4]}`;
    }
    campiAuto = {
      "Ns DDT": numeroDDT,
      "del": dataDDT,
      "Descrizione": "Assembraggio " + (commessa?.nome || ""),
      "qta": commessa?.quantita || "",
      "colli": String(colliValue),
      // DATA TRASPORTO e RITIRO: **SEMPRE OGGI!**
      "Testo8": oggiSlash,
      "Testo9": oggiSlash
    };
  } else {
    campiAuto = {
      "Descrizione": "Assembraggio " + (commessa?.nome || ""),
      "qta": commessa?.quantita || "",
      "colli": String(colliValue),
      "Testo8": oggiSlash,
      "Testo9": oggiSlash
    };
  }

  // 5. Compila PDF
  const pdfDoc = await PDFDocument.load(masterPDF);
  const form = pdfDoc.getForm();
  const fields = form.getFields();

  // --- CAMPI STANDARD (compila tutti) ---
  fields.forEach(f => {
    const fname = f.getName();
    if (campiAuto.hasOwnProperty(fname)) {
      try { form.getTextField(fname).setText(campiAuto[fname]); } catch {}
    } else if (fname.toLowerCase().includes("numero documento")) {
      try { form.getTextField(fname).setText(numeroBolla + "W"); } catch {}
    } else if (fname.toLowerCase().includes("data documento")) {
      try { form.getTextField(fname).setText(oggiSlash); } catch {}
    }
  });

  // --- VALORIZZA IL CAMPO PAG/PAGINA (anche se c’è più di una pagina) ---
  // Se vuoi multi-pagina, ciclare qui!
  fields.forEach(f => {
    const fname = f.getName();
    if (fname.toLowerCase().includes("pag")) {
      try { form.getTextField(fname).setText("1/1"); } catch {}
    }
  });

  // 6. Salva PDF (browser + server)
  let codiceCommessa = commessa?.codiceCommessa || "";
  if (!codiceCommessa && commessa?.nome) {
    const match = commessa.nome.match(/_C([a-zA-Z0-9]+)$/);
    codiceCommessa = match ? "C" + match[1] : commessa.nome;
  }
  const nomeFile = `DDT_${numeroBolla}W_${codiceCommessa}_${oggi}.pdf`;
  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: "application/pdf" });

  // --- Download browser ---
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeFile;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 500);

  // --- Salva su server ---
  await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = async () => {
      const pdfData = reader.result;
      try {
        await fetch("http://192.168.1.250:3001/api/save-pdf-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderPath: materialiPath, pdfData, fileName: nomeFile }),
        });
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  // --- Logga in Excel ---
  try {
    await fetch("http://192.168.1.250:3001/api/log-ddt-entrata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportDdtPath,
        dataDdt: oggiSlash,
        numeroDdt: numeroBolla + "W",
        codiceCommessa,
        quantita: commessa?.quantita || "",
        colli: String(colliValue),
        nsDdt: campiAuto["Ns DDT"] || "",
        del: campiAuto["del"] || "",
        percorsoPdf: materialiPath + "\\" + nomeFile,
        oreLavorazione: "",
        costoPz: "",
        costoTot: "",
        folderPath: commessa.percorso || commessa.folderPath
      })
    });
  } catch (err) {
    alert("⚠️ Errore salvataggio registro DDT:\n" + err.message);
  }
}
