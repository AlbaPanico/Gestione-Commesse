const fs = require('fs');
const path = require('path');

const FLAG_PATH = path.join(__dirname, "data", "last_report_week.json");

function getPrinterSettings(stampanti, nomeStampante) {
  return stampanti.find(
    p => (p.nome || p.name || '').trim().toLowerCase() === (nomeStampante || '').trim().toLowerCase()
  );
}

function timeToMs(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) return ((parts[0] * 3600) + (parts[1] * 60) + parts[2]) * 1000;
  if (parts.length === 2) return ((parts[0] * 60) + parts[1]) * 1000;
  if (parts.length === 1) return parts[0] * 1000;
  return 0;
}

function parseDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  if (dateStr.includes('/')) {
    const [d, m, y] = dateStr.split('/');
    const [hh, mm, ss] = (timeStr || '00:00:00').split(':');
    return new Date(y, m - 1, d, hh, mm, ss).getTime();
  }
  return new Date(`${dateStr}T${timeStr || '00:00:00'}`).getTime();
}

function findClosestIndex(arr, target) {
  let closestIdx = 0;
  let minDiff = Infinity;
  for (let i = 0; i < arr.length; i++) {
    const diff = Math.abs(arr[i] - target);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = i;
    }
  }
  return closestIdx;
}

function aggiornaTempoXCopiaEConsumo(allReport, monitorArr, stampantiSettings) {
  for (let job of allReport) {
    const nomeStampante = job.dispositivo || job.nome || job.device;
    const printerSett = getPrinterSettings(stampantiSettings, nomeStampante) || {};
    const prezzo_cmyk    = Number(printerSett.costo_cmyk    ?? printerSett.costoCMYK    ) || 0;
    const prezzo_w       = Number(printerSett.costo_w       ?? printerSett.costoW       ) || 0;
    const prezzo_vernice = Number(printerSett.costo_vernice ?? printerSett.costoVernice ) || 0;

    // ── Costo inchiostro (sempre, anche per Arizona A) ─────────────────────────
    const cmyk_ul =
      (Number(job.inkcolorcyan)     || 0) +
      (Number(job.inkcolormagenta)  || 0) +
      (Number(job.inkcoloryellow)   || 0) +
      (Number(job.inkcolorblack)    || 0);
    const w_ul  = Number(job.inkcolorwhite)   || 0;
    const v_ul  = Number(job.inkcolorvarnish) || 0;

    const costo_cmyk    = (cmyk_ul / 1_000_000) * prezzo_cmyk;
    const costo_w       = (w_ul   / 1_000_000) * prezzo_w;
    const costo_varnish = (v_ul   / 1_000_000) * prezzo_vernice;
    job["Costo Inchiostro"] = Number((costo_cmyk + costo_w + costo_varnish).toFixed(2));

    // ── Arizona A: energia non disponibile (mantieni inchiostro) ───────────────
    if ((nomeStampante || '').toLowerCase() === 'arizona a') {
      job["consumo_kwh"] = "";
      job["Tot Stampe (kWh)"] = "";
      continue;
    }

    const stampEseguite = Number(job.printsdone || job.noffinishedsets || 0);

    // ── Calcola consumo_kwh per copia SOLO se mancante ─────────────────────────
    if (
      (job["consumo_kwh"] === undefined || job["consumo_kwh"] === "") &&
      stampEseguite >= 1
    ) {
      const tStart = parseDateTime(job.startdate, job.starttime);
      const durataMs = timeToMs(job.activetime);
      const idleMs   = timeToMs(job.idletime);
      const tEnd = !isNaN(tStart) ? tStart + durataMs + idleMs : null;

      if (!isNaN(tStart) && tEnd) {
        const endDateObj = new Date(tEnd);
        job["fine 1 copia"] = `${String(endDateObj.getHours()).padStart(2, '0')}:${String(endDateObj.getMinutes()).padStart(2, '0')}:${String(endDateObj.getSeconds()).padStart(2, '0')}`;
      } else {
        job["fine 1 copia"] = "";
      }

      if (Array.isArray(monitorArr) && monitorArr.length > 0 && !isNaN(tStart) && tEnd) {
        const ordered = [...monitorArr].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const tsArr = ordered.map(d => new Date(d.timestamp).getTime());
        const idxStart = findClosestIndex(tsArr, tStart);
        const idxEnd   = findClosestIndex(tsArr, tEnd);
        const i1 = Math.min(idxStart, idxEnd);
        const i2 = Math.max(idxStart, idxEnd);
        const datiMonitor = ordered.slice(i1, i2 + 1);

        let somma = 0;
        for (const campione of datiMonitor) {
          const k1 = Number(campione.instant_kw_1);
          const k2 = Number(campione.instant_kw_2);
          if (!isNaN(k1) && !isNaN(k2)) {
            somma += (k1 + k2) * 5 / 3600;
          }
        }
        // kWh totali nel job → se ho copie, divido per copie per ottenere per-copia
        const kwhJob = datiMonitor.length > 0 ? Number(somma.toFixed(3)) : "";
        if (kwhJob !== "" && stampEseguite > 0) {
          job["consumo_kwh"] = Number((kwhJob / stampEseguite).toFixed(3));
        } else {
          job["consumo_kwh"] = "";
        }
      } else {
        job["consumo_kwh"] = "";
      }
    }
    // ── NON ricalcolare/azzerare se già presente ───────────────────────────────

    // ── Tot Stampe (kWh) = consumo_kwh (per copia) × set completati ────────────
    const perCopy =
      (job["consumo_kwh"] !== "" && !isNaN(job["consumo_kwh"]))
        ? Number(job["consumo_kwh"])
        : null;

    if (perCopy !== null && stampEseguite > 0) {
      job["Tot Stampe (kWh)"] = Number((perCopy * stampEseguite).toFixed(3));
    } else if (perCopy === 0 && stampEseguite > 0) {
      // caso esplicito: consumo per copia è 0 ma ho copie>0 → totale 0
      job["Tot Stampe (kWh)"] = 0;
    } else {
      job["Tot Stampe (kWh)"] = "";
    }
  }
}

// ========== BLOCCO BACKUP E RESET ==========

// Calcola numero settimana ISO
function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
  return weekNo;
}

function backupAndResetWeeklyReportsIfNeeded() {
  const now = new Date();
  const week = getWeekNumber(now);
  const year = now.getFullYear();
  let last = { week: null, year: null };

  // Carica flag settimanale
  if (fs.existsSync(FLAG_PATH)) {
    try {
      last = JSON.parse(fs.readFileSync(FLAG_PATH, "utf8"));
    } catch (e) {
      last = { week: null, year: null };
    }
  }
  // Solo se questa settimana è diversa dall'ultima già archiviata
  if (last.week === week && last.year === year) {
    return; // Già fatto, niente da fare
  }
  // Fai backup e reset
  const settingsPath = path.join(__dirname, "data", "stampantiSettings.json");
  if (!fs.existsSync(settingsPath)) return;
  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch (err) {
    console.error("[backupAndResetWeeklyReports] Errore parsing impostazioni:", err);
    return;
  }
  const reportFolder = settings.reportGeneralePath;
  if (!reportFolder || !fs.existsSync(reportFolder)) return;
  const files = fs.readdirSync(reportFolder)
    .filter(f =>
      /^Reportgenerali_.*\.json$/.test(f) &&
      !/_\d{1,2}_\d{4}\.json$/.test(f)
    );
  if (!files.length) {
    console.warn("[backupAndResetWeeklyReports] Nessun file Reportgenerali_<Stampante>.json trovato in", reportFolder);
    return;
  }
  for (const file of files) {
    const jsonPath = path.join(reportFolder, file);
    if (!fs.existsSync(jsonPath)) continue;

    const ext = path.extname(file);
    const basename = path.basename(file, ext);
    const newName = `${basename}_${week}_${year}${ext}`;
    const backupPath = path.join(reportFolder, newName);
    try {
      fs.copyFileSync(jsonPath, backupPath);
      console.log(`[BACKUP] Duplicato ${file} -> ${newName}`);
    } catch (e) {
      console.error(`[BACKUP] Errore duplicando ${file}:`, e);
    }
    // Reset file originale
    try {
      fs.writeFileSync(jsonPath, "[]", "utf8");
      console.log(`[RESET] Azzerato ${file}`);
    } catch (e) {
      console.error(`[RESET] Errore azzerando ${file}:`, e);
    }
  }
  // Aggiorna flag
  try {
    fs.writeFileSync(FLAG_PATH, JSON.stringify({ week, year }), "utf8");
  } catch (e) {
    // poco male
  }
}

// ========== LOGICA REPORT ==========
async function generaReportGenerali() {
  // Prima cosa: fa backup e reset se serve!
  backupAndResetWeeklyReportsIfNeeded();

  const settingsPath = path.join(__dirname, "data", "stampantiSettings.json");
  if (!fs.existsSync(settingsPath)) return;
  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch (err) {
    console.error("[generaReportGenerali] Errore parsing impostazioni:", err);
    return;
  }
  const reportFolder = settings.reportGeneralePath;
  if (!reportFolder || !fs.existsSync(reportFolder)) return;
  const monitorPath = settings.monitorJsonPath;
  let monitorArr = [];
  if (monitorPath && fs.existsSync(monitorPath)) {
    try {
      monitorArr = JSON.parse(fs.readFileSync(monitorPath, 'utf8'));
    } catch (err) {
      console.error("[generaReportGenerali] Errore parsing data.json:", err);
      monitorArr = [];
    }
  }
  const files = fs.readdirSync(reportFolder).filter(f => /^Reportgenerali_.*\.json$/.test(f));
  if (!files.length) {
    console.warn("[generaReportGenerali] Nessun file Reportgenerali_<Stampante>.json trovato in", reportFolder);
    return;
  }
  const stampantiSettings = Array.isArray(settings.printers) ? settings.printers : [];

  for (const file of files) {
    const jsonPath = path.join(reportFolder, file);
    let allReport = [];
    if (fs.existsSync(jsonPath)) {
      try {
        const raw = fs.readFileSync(jsonPath, "utf8").trim();
        allReport = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(allReport)) {
          console.warn(
            `[generaReportGenerali] Warning: ${file} non è array, lo resetto a []`
          );
          allReport = [];
        }
      } catch (err) {
        console.error(`[generaReportGenerali] Errore parse ${file}:`, err);
        continue;
      }
    }

    aggiornaTempoXCopiaEConsumo(allReport, monitorArr, stampantiSettings);

    try {
      fs.writeFileSync(
        jsonPath,
        JSON.stringify(allReport, null, 2),
        "utf8"
      );
      console.log(`[generaReportGenerali] ✅ ${file} aggiornato correttamente!`);
    } catch (err) {
      console.error(`[generaReportGenerali] Errore scrittura ${file}:`, err);
    }
  }
}

module.exports = { generaReportGenerali };
