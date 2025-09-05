// File: stampantiMultiScheduler.js

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

// === Helpers settimana ISO ===
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Thursday in current week decides the year
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return weekNo;
}
function getISOWeekYear(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return d.getUTCFullYear();
}


// 🔥 Importa la funzione di calcolo consumo (deve essere nel path giusto!)
const { generaReportGenerali } = require('./generaReportGenerali');


const settingsPath = path.join(__dirname, 'data', 'stampantiSettings.json');

// Scarica testo (html)
function fetchText(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Scarica file binario
function downloadFile(url, dest, cb) {
  const mod = url.startsWith('https') ? https : http;
  const options = new URL(url);
  options.headers = { 'User-Agent': 'curl/8.0' };
  const file = fs.createWriteStream(dest);
  mod.get(options, response => {
    if (response.statusCode !== 200) {
      file.close();
      return cb(new Error("HTTP Error " + response.statusCode));
    }
    response.pipe(file);
    file.on('finish', () => file.close(cb));
  }).on('error', err => {
    file.close();
    return cb(err);
  });
}

/* -----------------------------------------------------------
   NUOVO: Rigenera il file settimanale a partire dai JSON per-stampante
----------------------------------------------------------- */
async function rigeneraSettimana(week, year) {
  try {
    // 1) recupera la cartella dei report dal settings
    let reportGeneralePath = null;
    if (fs.existsSync(settingsPath)) {
      try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        if (settings.reportGeneralePath && fs.existsSync(settings.reportGeneralePath)) {
          reportGeneralePath = settings.reportGeneralePath;
        }
      } catch {}
    }
    if (!reportGeneralePath) reportGeneralePath = path.join(__dirname, "data");

    // 2) leggi tutti i JSON per-stampante: Reportgenerali_<stampante>.json (escludi i settimanali)
    const files = fs.readdirSync(reportGeneralePath)
      .filter(f => /^Reportgenerali_.*\.json$/i.test(f))
      .filter(f => !/^Reportgenerali_Stampanti_\d{1,2}_\d{4}\.json$/i.test(f)); // esclude i settimanali

    const allRows = [];
    for (const fname of files) {
      const full = path.join(reportGeneralePath, fname);
      let arr = [];
      try {
        const raw = fs.readFileSync(full, 'utf8');
        arr = raw.trim() ? JSON.parse(raw) : [];
      } catch { arr = []; }
      if (!Array.isArray(arr) || arr.length === 0) continue;

      // normalizza e calcola la data "giorno" da campo startdate / readydate / receptiondate
      for (const r of arr) {
        const dStr = (r.startdate || r.readydate || r.receptiondate || "").slice(0, 10);
        let d = null;
        if (/\d{4}-\d{2}-\d{2}/.test(dStr)) {
          d = new Date(dStr + "T00:00:00");
        } else {
          // fallback: oggi
          const today = new Date();
          d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        }

        const w = getISOWeek(d);
        const y = getISOWeekYear(d);
        if (w === Number(week) && y === Number(year)) {
          allRows.push({
            ...r,
            source: fname,
            giorno: d.toISOString().slice(0, 10)
          });
        }
      }
    }

    // 3) scrivi/riscrivi il file settimanale
    const weeklyFile = path.join(reportGeneralePath, `Reportgenerali_Stampanti_${week}_${year}.json`);
    fs.writeFileSync(weeklyFile, JSON.stringify(allRows, null, 2), 'utf8');
    console.log(`✅ Rigenerata settimana ${week}/${year}: ${weeklyFile} (${allRows.length} righe)`);
  } catch (e) {
    console.error("❌ Errore in rigeneraSettimana:", e);
  }
}

/* -----------------------------------------------------------
   GENERA REPORT ACL --> JSON, AGGIUNGI CONSUMO_KWH SOLO PER ARIZONA B E NON RESETTARE MAI
----------------------------------------------------------- */
async function generaReportDaAclFile(aclFilePath, outputJsonPath, monitorJsonPath, nomeStampanteForza) {
  if (!fs.existsSync(aclFilePath)) {
    console.warn("File ACL non trovato:", aclFilePath);
    return;
  }
  const content = fs.readFileSync(aclFilePath, "utf8").trim().split(/\r?\n/);
  if (content.length < 2) {
    console.warn("File ACL vuoto o senza dati:", aclFilePath);
    return;
  }
  const headers = content[0].split(";").map(h => h.trim().replace(/^"|"$/g, ""));
  const newRecords = [];
  for (let i = 1; i < content.length; i++) {
    const row = content[i].split(";").map(f => f.trim().replace(/^"|"$/g, ""));
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx];
    });
    // Controlla che almeno uno dei campi principali NON sia vuoto
    const isEmptyRecord = Object.values(obj).every(value => !value.trim());
    if (!isEmptyRecord && obj.jobid && obj.jobname) {
      newRecords.push(obj);
    }
  }

  // Carica record già presenti
  let allRecords = [];
  if (fs.existsSync(outputJsonPath)) {
    try {
      const raw = fs.readFileSync(outputJsonPath, 'utf8');
      allRecords = raw.trim() ? JSON.parse(raw) : [];
    } catch (err) {
      allRecords = [];
    }
  }

  // Leggi monitorData (per calcolo kWh)
  let monitorData = [];
  if (monitorJsonPath && fs.existsSync(monitorJsonPath)) {
    try {
      monitorData = JSON.parse(fs.readFileSync(monitorJsonPath, 'utf8'));
      monitorData.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    } catch (err) {
      monitorData = [];
    }
  }

  console.log("[DEBUG_MONITOR] monitorData length:", monitorData.length, monitorData[0], monitorData[monitorData.length - 1]);

  // Funzione per calcolare consumo SOLO su ARIZONA B (ora bypass, la vera logica è globale)
  function calcConsumoKwh(r) {
    const device = String(r["Device"] || r["Dispositivo"] || "").replace(/\s+/g, " ").trim().toUpperCase();
    if (!device.includes("ARIZONA B")) {
      
      return "";
    }
    return "";
  }

  // Unisci senza duplicati (chiave: jobid|jobname|printmode)
  const getKey = r =>
    (r["jobid"] || r["Job ID"] || r["documentid"] || "") + "|" +
    (r["jobname"] || "") + "|" +
    (r["printmode"] || "");

  // helper: numero valido oppure null
  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // helper: scegli il consumo "migliore" senza mai diminuire né azzerare
  // Regole:
  // - se entrambi numeri -> max con 3 decimali
  // - se vecchio è numero e nuovo non lo è (o è 0/blank) -> tieni il vecchio
  // - se solo il nuovo è numero -> prendi il nuovo (3 decimali)
  // - altrimenti lascia com'è
  const pickConsumo = (oldVal, newVal) => {
    const a = toNum(oldVal);
    const b = toNum(newVal);
    if (a !== null && b !== null) return Number(Math.max(a, b).toFixed(3));
    if (a !== null && (b === null || b === 0)) return a;
    if (b !== null) return Number(b.toFixed(3));
    return (oldVal !== undefined ? oldVal : newVal);
  };

  const recordsMap = new Map(allRecords.map(r => [getKey(r), r]));

  newRecords.forEach(r => {
    // placeholder attuale (ritorna ""), lo manteniamo per non cambiare la struttura
    r["consumo_kwh"] = calcConsumoKwh(r);

    if (nomeStampanteForza) r["dispositivo"] = nomeStampanteForza;
    const key = getKey(r);

    // se esiste già una versione "Done" ed il nuovo non è "Done", mantieni l'esistente,
    // MA senza mai peggiorare il 'consumo_kwh' (quindi niente reset)
    if (recordsMap.has(key)) {
      const existing = recordsMap.get(key);
      const existingIsDone = (existing.result === "Done" || existing.result === "done");
      const newIsDone = (r.result === "Done");

      // base merge: unione campi, i valori non vuoti del nuovo r sovrascrivono l'esistente
      const merged = { ...existing, ...r };

      // anti-reset & monotonia: ricalcola il campo con la regola pickConsumo
      merged["consumo_kwh"] = pickConsumo(existing["consumo_kwh"], r["consumo_kwh"]);

      // Se l'esistente era "Done" e il nuovo non lo è, tieni comunque 'result' e altri flag dell'esistente
      if (existingIsDone && !newIsDone) {
        merged.result = existing.result;
      }

      recordsMap.set(key, merged);
    } else {
      // primo inserimento: se consumo è numerico, normalizza a numero con 3 decimali
      const n = toNum(r["consumo_kwh"]);
      if (n !== null) r["consumo_kwh"] = Number(n.toFixed(3));
      recordsMap.set(key, r);
    }
  });

  // NIENTE ricalcoli post-merge che possano abbassare o azzerare il consumo_kwh

  // Salva l’array aggiornato
  const outputArr = Array.from(recordsMap.values());
  fs.writeFileSync(outputJsonPath, JSON.stringify(outputArr, null, 2));
  console.log(`✅ Report JSON aggiornato: ${outputJsonPath} (${outputArr.length} righe, consumo_kwh calcolato solo su Arizona B, campo dispositivo forzato: ${nomeStampanteForza})`);

  // 👉 Mantieni la tua generazione generale
  if (
    outputJsonPath.endsWith('Reportgenerali_Arizona A.json') ||
    outputJsonPath.endsWith('Reportgenerali_Arizona B.json')
  ) {
    try {
      generaReportGenerali();
    } catch (e) {
      console.warn("⚠️ generaReportGenerali ha dato errore (non blocco):", e?.message || e);
    }
  }

  // 👉 NUOVO: Rigenera SUBITO il settimanale corrente (pari passo)
  try {
    const now = new Date();
    const w = getISOWeek(now);
    const y = now.getFullYear();
    await rigeneraSettimana(w, y);
  } catch (e) {
    console.warn("⚠️ rigeneraSettimana fallita (non blocco):", e?.message || e);
  }
}

// Per ogni stampante: scarica l'ULTIMO ACL e genera il suo report
async function processPrinter(printer, monitorJsonPath) {
  if (!printer.aclLink || !printer.nome) return;
  const baseLink = printer.aclLink.trim();
  const nomeStampante = printer.nome.trim();

  // STEP 1: Scarica la pagina HTML che contiene la lista dei file ACL
  let html;
  try {
    html = await fetchText(baseLink);
  } catch (err) {
    console.error(`❌ Errore scaricando HTML lista ACL per ${nomeStampante}:`, err.message);
    return;
  }

  // STEP 2: Trova l'ultimo file ACL disponibile
  const matches = [...html.matchAll(/href="([^"]+\.ACL)"/gi)];
  if (!matches.length) {
    console.error(`❌ Nessun file ACL trovato per ${nomeStampante} in ${baseLink}`);
    return;
  }
  const files = matches.map(m => m[1]).sort();
  const lastFile = files[files.length - 1];

  // Costruisci URL ASSOLUTO
  let aclUrl;
  if (lastFile.startsWith("http")) {
    aclUrl = lastFile;
  } else if (lastFile.startsWith("/")) {
    const base = baseLink.match(/^https?:\/\/[^\/]+/)[0];
    aclUrl = base + lastFile;
  } else {
    aclUrl = baseLink.replace(/\/$/, '') + '/' + lastFile;
  }

  const nomeFileAcl = `last_acl_${nomeStampante}.acl`;
  const aclFilePath = path.join(__dirname, 'data', nomeFileAcl);

  // Qui scegli la cartella di salvataggio dei report GENERALI:
  let reportGeneralePath = null;
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (settings.reportGeneralePath) {
        reportGeneralePath = settings.reportGeneralePath;
      }
    } catch(e){
      console.error("Errore lettura impostazioni reportGeneralePath:", e);
    }
  }
  if (!reportGeneralePath || !fs.existsSync(reportGeneralePath)) {
    console.error("Percorso REPORT GENERALE non configurato o non esistente:", reportGeneralePath);
    reportGeneralePath = path.join(__dirname, "data");
  }
  const reportJsonPath = path.join(reportGeneralePath, `Reportgenerali_${nomeStampante}.json`);
  console.log("👉 Salvo report JSON:", reportJsonPath);

  return new Promise(resolve => {
    downloadFile(aclUrl, aclFilePath, async (err) => {
      if (err) {
        console.error(`❌ Errore download ACL per ${nomeStampante}:`, err.message);
      } else {
        console.log(`✅ Scaricato ACL per ${nomeStampante}: ${lastFile}`);
        // genera e TRIGGER pari-passo dentro generaReportDaAclFile
        await generaReportDaAclFile(aclFilePath, reportJsonPath, monitorJsonPath, nomeStampante);
      }
      resolve();
    });
  });
}

// Ciclo principale: ogni 3 secondi lavora su tutte le stampanti
async function cicloStampanti() {
  if (!fs.existsSync(settingsPath)) return;
  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (err) {
    console.error('Errore parsing impostazioni:', err);
    return;
  }
  const printers = settings.printers || [];
  const monitorJsonPath = settings.monitorJsonPath || "";

  for (const printer of printers) {
    await processPrinter(printer, monitorJsonPath);
  }
}

// Funzione esportata per avvio da server.js
function startMultiPrinterScheduler() {
  setInterval(cicloStampanti, 3000);
  console.log("🔁 Multi-stampante scheduler avviato (ogni 3 secondi)!");
}

module.exports = { startMultiPrinterScheduler, rigeneraSettimana };
