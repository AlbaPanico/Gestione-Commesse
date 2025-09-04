// File: stampantiMultiScheduler.js

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

// 🔥 Importa la funzione di calcolo consumo (deve essere nel path giusto!)
const { generaReportGenerali } = require('./generaReportGenerali');

// === AGGIUNGI SUBITO QUI! ===
function logToFile(obj) {
  const line = JSON.stringify(obj, null, 0) + "\n";
  fs.appendFileSync('debug_consumo.log', line);
}

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

// GENERA REPORT ACL --> JSON, AGGIUNGI CONSUMO_KWH SOLO PER ARIZONA B E NON RESETTARE MAI
function generaReportDaAclFile(aclFilePath, outputJsonPath, monitorJsonPath, nomeStampanteForza) {
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

  // Funzione per calcolare consumo SOLO su ARIZONA B (la puoi lasciare anche vuota o con solo log, tanto ora usi quella globale)
  function calcConsumoKwh(r) {
    const device = String(r["Device"] || r["Dispositivo"] || "").replace(/\s+/g, " ").trim().toUpperCase();
    if (!device.includes("ARIZONA B")) {
      logToFile({
        type: "SKIP",
        jobname: r.jobname,
        motivo: "Non Arizona B",
        device
      });
      return "";
    }
    // (resto della funzione qui se vuoi log o debug... altrimenti la puoi pure togliere)
    return "";
  }

  // Unisci senza duplicati (chiave: documentid + jobid + startdate)
  const getKey = r =>
    (r["jobid"] || r["Job ID"] || r["documentid"] || "") + "|" +
    (r["jobname"] || "") + "|" +
    (r["printmode"] || "");

  const recordsMap = new Map(allRecords.map(r => [getKey(r), r]));
  newRecords.forEach(r => {
    r["consumo_kwh"] = calcConsumoKwh(r); // puoi lasciarla anche vuota, tanto la vera logica ora è globale
    logToFile({ type: "FINE_RIGA", jobname: r.jobname, consumo_kwh: r["consumo_kwh"], id: r["jobid"] || r["documentid"] });
    if (nomeStampanteForza) r["dispositivo"] = nomeStampanteForza;
    const key = getKey(r);

    // Se in recordsMap esiste già una versione "Done", non sovrascrivere con una incompleta
    if (recordsMap.has(key)) {
      const existing = recordsMap.get(key);
      if (
        (existing.result === "Done" || existing.result === "done") &&
        (!r.result || r.result !== "Done")
      ) {
        return; // salto questa riga, tengo la "Done"
      }
    }
    recordsMap.set(key, r);
  });

  // Ricalcola consumi dove mancano (retry su TUTTE) - ormai bypassato, ma lascialo per debug
  recordsMap.forEach((r, k) => {
    if (
      r["dispositivo"] &&
      r["dispositivo"].toUpperCase().includes("ARIZONA B") &&
      (!r["consumo_kwh"] || r["consumo_kwh"] === "" || r["consumo_kwh"] === 0)
    ) {
      const nuovoConsumo = calcConsumoKwh(r);
      if (nuovoConsumo !== "") {
        r["consumo_kwh"] = nuovoConsumo;
      }
    }
  });

  // Salva l’array aggiornato
  const outputArr = Array.from(recordsMap.values());
  fs.writeFileSync(outputJsonPath, JSON.stringify(outputArr, null, 2));
  console.log(`✅ Report JSON aggiornato: ${outputJsonPath} (${outputArr.length} righe, consumo_kwh calcolato solo su Arizona B, campo dispositivo forzato: ${nomeStampanteForza})`);

  // 👉 AGGIUNGI QUESTA CHIAMATA DOPO IL SALVATAGGIO DEL FILE JSON
  if (
    outputJsonPath.endsWith('Reportgenerali_Arizona A.json') ||
    outputJsonPath.endsWith('Reportgenerali_Arizona B.json')
  ) {
    generaReportGenerali();
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
    downloadFile(aclUrl, aclFilePath, (err) => {
      if (err) {
        console.error(`❌ Errore download ACL per ${nomeStampante}:`, err.message);
      } else {
        console.log(`✅ Scaricato ACL per ${nomeStampante}: ${lastFile}`);
        generaReportDaAclFile(aclFilePath, reportJsonPath, monitorJsonPath, nomeStampante);
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

module.exports = { startMultiPrinterScheduler };
