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
    // 1) cartella report
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
    if (!fs.existsSync(reportGeneralePath)) fs.mkdirSync(reportGeneralePath, { recursive: true });

    // 2) leggi SOLO i JSON per-stampante storici (se presenti) per ricostruire la settimana
    const files = fs.readdirSync(reportGeneralePath)
      .filter(f => /^Reportgenerali_.*\.json$/i.test(f))
      .filter(f => !/^Reportgenerali_(Arizona|Stampanti)_\d{1,2}_\d{4}\.json$/i.test(f)); // esclude i settimanali

    const toMillis = (dateStr, timeStr = "00:00:00") => {
      if (!dateStr) return NaN;
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return new Date(`${dateStr}T${timeStr}`).getTime();
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
        const [d, m, y] = dateStr.split("/");
        const [hh, mm, ss] = (timeStr || "00:00:00").split(":");
        return new Date(y, m - 1, d, hh, mm, ss).getTime();
      }
      return NaN;
    };

    const allRows = [];
    for (const fname of files) {
      const full = path.join(reportGeneralePath, fname);
      let arr = [];
      try {
        const raw = fs.readFileSync(full, 'utf8');
        arr = raw.trim() ? JSON.parse(raw) : [];
      } catch { arr = []; }
      if (!Array.isArray(arr) || arr.length === 0) continue;

      for (const r of arr) {
        // 🔎 Opzione A: assegna alla settimana della DATA DI FINE; fallback alla DATA DI INIZIO
        const tsEnd   = toMillis(r.readydate, r.readytime);
        const tsStart = toMillis(r.startdate, r.starttime);
        const ts = (!isNaN(tsEnd) && tsEnd) ? tsEnd
                 : (!isNaN(tsStart) && tsStart ? tsStart : NaN);

        if (!isNaN(ts)) {
          const d = new Date(ts);
          const w = getISOWeek(d);
          const y = getISOWeekYear(d);
          if (w === Number(week) && y === Number(year)) allRows.push({ ...r });
        }
      }
    } // ← chiusura corretta del for (files)

    // 3) scrivi SOLO il nuovo unificato
    const weeklyFile = path.join(reportGeneralePath, `Reportgenerali_Arizona_${week}_${year}.json`);
    fs.writeFileSync(weeklyFile, JSON.stringify(allRows, null, 2), 'utf8');
    console.log(`✅ Rigenerata settimana ${week}/${year}: ${weeklyFile} (${allRows.length} righe)`);
  } catch (e) {
    console.error("❌ Errore in rigeneraSettimana:", e);
  }
}

/* -----------------------------------------------------------
   GENERA REPORT ACL --> JSON, AGGIUNGI CONSUMO_KWH SOLO PER ARIZONA B E NON RESETTARE MAI
----------------------------------------------------------- */
async function generaReportDaAclFile(aclFilePath, _outputJsonPathIgnored, monitorJsonPath, nomeStampanteForza) {
  // === 0) Leggi ACL ===
  if (!fs.existsSync(aclFilePath)) {
    console.warn("File ACL non trovato:", aclFilePath);
    return;
  }
  const lines = fs.readFileSync(aclFilePath, "utf8").trim().split(/\r?\n/);
  if (lines.length < 2) {
    console.warn("File ACL vuoto o senza dati:", aclFilePath);
    return;
  }
  const headers = lines[0].split(";").map(h => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map(l => l.split(";").map(f => f.trim().replace(/^"|"$/g, "")));
  const newRecords = [];
  for (const cols of rows) {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cols[i]; });
    const isEmpty = Object.values(obj).every(v => !String(v || "").trim());
    if (!isEmpty && (obj.jobid || obj["Job ID"] || obj.documentid) && obj.jobname) {
      newRecords.push(obj);
    }
  }

  // === 1) Paths & settaggi ===
  const settingsPathLocal = path.join(__dirname, "data", "stampantiSettings.json");
  let reportGeneralePath = path.join(__dirname, "data");
  let printersSettings = [];
  if (fs.existsSync(settingsPathLocal)) {
    try {
      const s = JSON.parse(fs.readFileSync(settingsPathLocal, "utf8"));
      if (s.reportGeneralePath && fs.existsSync(s.reportGeneralePath)) {
        reportGeneralePath = s.reportGeneralePath;
      }
      if (Array.isArray(s.printers)) {
        printersSettings = s.printers;
      }
    } catch {}
  }

  const now = new Date();
  const week = getISOWeek(now);
  const year = getISOWeekYear(now);

  const weeklyFile = path.join(reportGeneralePath, `Reportgenerali_Arizona_${week}_${year}.json`);
  if (!fs.existsSync(reportGeneralePath)) fs.mkdirSync(reportGeneralePath, { recursive: true });

  // === 2) Carica file unificato della settimana CORRENTE (append-only) ===
  let all = [];
  try {
    if (fs.existsSync(weeklyFile)) {
      const raw = fs.readFileSync(weeklyFile, "utf8").trim();
      all = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(all)) all = [];
    }
  } catch { all = []; }

  // === 3) Monitor (per Arizona B) ===
  let monitorData = [];
  if (monitorJsonPath && fs.existsSync(monitorJsonPath)) {
    try {
      monitorData = JSON.parse(fs.readFileSync(monitorJsonPath, "utf8")) || [];
      monitorData.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    } catch { monitorData = []; }
  }
  const findClosestKwh = (ts) => {
    if (!monitorData.length) return null;
    let best = null, min = Infinity;
    for (const r of monitorData) {
      const d = Math.abs(new Date(r.timestamp).getTime() - ts);
      if (d < min) { min = d; best = r.today_kwh; }
    }
    return (best !== undefined && best !== null) ? Number(best) : null;
  };

  // === 4) Helpers ===
  const toMillis = (dateStr, timeStr = "00:00:00") => {
    if (!dateStr) return NaN;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return new Date(`${dateStr}T${timeStr}`).getTime();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
      const [d, m, y] = dateStr.split("/");
      const [hh, mm, ss] = (timeStr || "00:00:00").split(":");
      return new Date(y, m - 1, d, hh, mm, ss).getTime();
    }
    return NaN;
  };
  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const pickConsumo = (oldVal, newVal) => {
    const a = toNum(oldVal);
    const b = toNum(newVal);
    if (a !== null && b !== null) return Number(Math.max(a, b).toFixed(3));
    if (a !== null && (b === null || b === 0)) return a;
    if (b !== null) return Number(b.toFixed(3));
    return (oldVal !== undefined ? oldVal : newVal);
  };
  const getKey = (r) =>
    (r["jobid"] || r["Job ID"] || r["documentid"] || "") + "|" +
    (r["jobname"] || "") + "|" +
    (r["printmode"] || "") + "|" +
    (r["dispositivo"] || r["Device"] || "");

  const isArizonaB = (name) => String(name || "").trim().toUpperCase().includes("ARIZONA B");
  const isArizonaA = (name) => String(name || "").trim().toUpperCase().includes("ARIZONA A");

  const findPrinterSettings = (name) => {
    const wanted = String(name || "").trim().toLowerCase();
    return printersSettings.find(p =>
      String(p.nome || p.name || "").trim().toLowerCase() === wanted
    );
  };
  const calcCostoInchiostro = (row, printerSett) => {
    if (!row) return null;
    const prezzo_cmyk    = Number(printerSett?.costo_cmyk ?? printerSett?.costoCMYK ?? 0) || 0;
    const prezzo_w       = Number(printerSett?.costo_w ?? printerSett?.costoW ?? 0) || 0;
    const prezzo_vernice = Number(printerSett?.costo_vernice ?? printerSett?.costoVernice ?? 0) || 0;

    const c = Number(row.inkcolorcyan)     || 0;
    const m = Number(row.inkcolormagenta)  || 0;
    const y = Number(row.inkcoloryellow)   || 0;
    const k = Number(row.inkcolorblack)    || 0;
    const w = Number(row.inkcolorwhite)    || 0;
    const v = Number(row.inkcolorvarnish)  || 0;

    const cmyk_ul = c + m + y + k; // unità raw (µL) come nel frontend
    // Prezzi attesi in €/L: converto µL -> L dividendo per 1_000_000
    const costo_cmyk    = (cmyk_ul / 1_000_000) * prezzo_cmyk;
    const costo_w       = (w      / 1_000_000) * prezzo_w;
    const costo_varnish = (v      / 1_000_000) * prezzo_vernice;
    const tot = costo_cmyk + costo_w + costo_varnish;

    return Number.isFinite(tot) ? Number(tot.toFixed(2)) : null;
  };

  // mappa esistente per merge
  const map = new Map(all.map(r => [getKey(r), r]));

  // === 5) Elabora nuovi record SOLO per la settimana corrente (file corrente) ===
  for (const r0 of newRecords) {
    const r = { ...r0 };

    // forza dispositivo
    if (nomeStampanteForza) r["dispositivo"] = nomeStampanteForza;

        // data/ora job (priorità FINE → readydate/readytime; fallback INIZIO)
    const sd = r.startdate || r["startdate"];
    const st = r.starttime || r["starttime"] || "00:00:00";
    const rd = r.readydate  || r["readydate"];
    const rt = r.readytime  || r["readytime"] || "00:00:00";
    const tStart = toMillis(sd, st);
    const tEnd   = toMillis(rd, rt);

    // 🔎 Regola settimanale: assegnazione per DATA DI FINE (readydate/readytime).
    // Se la fine manca, fallback alla data di inizio. Scriviamo SOLO sul file della
    // settimana corrente (week/year passati in input).
    const recTs = (!isNaN(tEnd) && tEnd) ? tEnd
                 : (!isNaN(tStart) && tStart ? tStart : NaN);
    const recDate = !isNaN(recTs) ? new Date(recTs) : new Date();
    const recW = getISOWeek(recDate);
    const recY = getISOWeekYear(recDate);
    if (recW !== week || recY !== year) {
      // Evitiamo di modificare file di settimane diverse (append-only sulla settimana target).
      continue;
    }


    // calcolo consumo per copia SOLO Arizona B se possibile (altrimenti lascio vuoto/new)
    let newConsumo = r["consumo_kwh"];
    if (isArizonaB(r["dispositivo"])) {
      const k1 = (!isNaN(tStart)) ? findClosestKwh(tStart) : null;
      const k2 = (!isNaN(tEnd))   ? findClosestKwh(tEnd)   : null;
      if (k1 !== null && k2 !== null && k2 >= k1) {
        const kwhTot = k2 - k1;
        const copie = Number(r.noffinishedsets || r.printsdone || 0);
        newConsumo = (copie > 0) ? Number((kwhTot / copie).toFixed(3)) : Number(kwhTot.toFixed(3));
      }
    } else if (isArizonaA(r["dispositivo"])) {
      // coerente con la tua logica: per A energia vuota
      newConsumo = "";
    }

    // calcolo costo inchiostro (per tutte le stampanti)
    const printerSett = findPrinterSettings(r["dispositivo"]);
    const costoInk   = calcCostoInchiostro(r, printerSett);

    // dedupe/merge
  const key = getKey(r);
  if (map.has(key)) {
    const ex = map.get(key);
    const merged = { ...ex, ...r };

    // consumo_kwh (per copia) con regola di merge
    merged["consumo_kwh"] = pickConsumo(ex["consumo_kwh"], newConsumo);

    // Calcolo "Tot Stampe (kWh)" = consumo_kwh (per copia) × set completati
    const copieMerged = Number(merged.noffinishedsets || merged.printsdone || 0);
    const cMerged = (merged["consumo_kwh"] !== "" && !isNaN(merged["consumo_kwh"]))
      ? Number(merged["consumo_kwh"])
      : null;
    merged["Tot Stampe (kWh)"] =
      (cMerged !== null && copieMerged > 0)
        ? Number((cMerged * copieMerged).toFixed(3))
        : (cMerged === 0 && copieMerged > 0 ? 0 : "");

    // preserva "Done" se l'esistente è Done e il nuovo non lo è
    const exDone = (String(ex.result || "").toLowerCase() === "done");
    const newDone = (String(r.result || "").toLowerCase() === "done");
    if (exDone && !newDone) merged.result = ex.result;

    map.set(key, merged);
  } else {
    // primo inserimento
    const n = toNum(newConsumo);
    if (n !== null) {
      r["consumo_kwh"] = Number(n.toFixed(3));
    } else if (newConsumo === "" || newConsumo === 0) {
      r["consumo_kwh"] = newConsumo;
    }

    // Calcolo "Tot Stampe (kWh)" anche nel ramo nuovo
    const copie = Number(r.noffinishedsets || r.printsdone || 0);
    const c = (r["consumo_kwh"] !== "" && !isNaN(r["consumo_kwh"]))
      ? Number(r["consumo_kwh"])
      : null;
    r["Tot Stampe (kWh)"] =
      (c !== null && copie > 0)
        ? Number((c * copie).toFixed(3))
        : (c === 0 && copie > 0 ? 0 : "");

    map.set(key, r);
  }

  }

  // === 6) Scrivi SOLO il file settimanale unificato corrente ===
  const out = Array.from(map.values());
  fs.writeFileSync(weeklyFile, JSON.stringify(out, null, 2), "utf8");
  console.log(`✅ Aggiornato ${path.basename(weeklyFile)} — righe: ${out.length}`);
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

  // 1) Scarica ed elabora gli ACL per tutte le stampanti
  for (const printer of printers) {
    await processPrinter(printer, monitorJsonPath);
  }

  // 2) Subito dopo, aggiorna i JSON per-stampante con:
  //    - Costo Inchiostro (sempre)
  //    - consumo_kwh per copia se mancante (per coerenza)
  try {
    await generaReportGenerali();
  } catch (e) {
    console.warn('[cicloStampanti] Warning in generaReportGenerali:', e?.message || String(e));
  }
}

// Funzione esportata per avvio da server.js
function startMultiPrinterScheduler() {
  setInterval(cicloStampanti, 3000);
  console.log("🔁 Multi-stampante scheduler avviato (ogni 3 secondi)!");
}

module.exports = { startMultiPrinterScheduler, rigeneraSettimana };
