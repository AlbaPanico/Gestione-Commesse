// File: server.js

const express = require('express');
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const cron = require('node-cron');
const { startMultiPrinterScheduler, rigeneraSettimana } = require('./stampantiMultiScheduler');
const crypto = require('crypto');
const app = express();
const { PDFDocument } = require('pdf-lib');


const XLSX_STYLE = require('xlsx-style'); // per stili/scrittura
const XLSX = require('xlsx');             // per creare fogli da array
const { spawn } = require('child_process');

const TEMPLATE_DDT_PATH = path.join(__dirname, 'Template', 'DDT_Work.xlsx');
const PYTHON_PATH = 'python'; // o 'python3'
const MATERIALI_SCRIPT = 'C:\\Users\\Applicazioni\\Gestione Commesse\\FinestraMateriali.py';

// ───────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ───────────────────────────────────────────────────────────────────────────────
console.log('Avvio automatico del backend materiali Flask...');
const materialiProc = spawn(PYTHON_PATH, [MATERIALI_SCRIPT], { detached: true, stdio: 'ignore' });
materialiProc.unref();

app.use(cors());
app.use(express.json({ limit: '200mb' }));

// Utenti attivi (websocket presence)
let activeUsers = [];
const notifyActiveUsers = () => {
  const message = JSON.stringify({ type: 'activeUsers', data: activeUsers });
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(message); });
};

// ───────────────────────────────────────────────────────────────────────────────
// Impostazioni globali + file data
// ───────────────────────────────────────────────────────────────────────────────
const settingsFolderPath = '\\\\192.168.1.250\\users\\applicazioni\\gestione commesse\\data';
if (!fs.existsSync(settingsFolderPath)) fs.mkdirSync(settingsFolderPath, { recursive: true });
const settingsFilePath = path.join(settingsFolderPath, 'impostazioni.json');

// ── BOLLE USCITA (con reset giornaliero reale)
const bolleUscitaPath = path.join(__dirname, 'data', 'bolle_in_uscita.json');
const oggiISO = () => new Date().toISOString().split('T')[0];

function ensureFile(dirPath, defaultObj) {
  if (!fs.existsSync(path.dirname(dirPath))) fs.mkdirSync(path.dirname(dirPath), { recursive: true });
  if (!fs.existsSync(dirPath)) fs.writeFileSync(dirPath, JSON.stringify(defaultObj, null, 2));
}

function getBolleUscita() {
  ensureFile(bolleUscitaPath, { progressivo: 1, ultimaData: oggiISO() });
  try {
    const data = JSON.parse(fs.readFileSync(bolleUscitaPath, 'utf8')) || {};
    if (!data.ultimaData) {
      data.ultimaData = oggiISO();
      fs.writeFileSync(bolleUscitaPath, JSON.stringify(data, null, 2));
    }
    return data;
  } catch {
    const initial = { progressivo: 1, ultimaData: oggiISO() };
    fs.writeFileSync(bolleUscitaPath, JSON.stringify(initial, null, 2));
    return initial;
  }
}
function saveBolleUscita(prog, data = oggiISO()) {
  const record = { progressivo: prog, ultimaData: data };
  fs.writeFileSync(bolleUscitaPath, JSON.stringify(record, null, 2));
  console.log('🚚 SALVATO bolle_in_uscita.json:', record);
}

// ── BOLLE ENTRATA (senza reset)
const bolleEntrataPath = path.join(__dirname, 'data', 'bolle_in_entrata.json');
function getBolleEntrata() {
  ensureFile(bolleEntrataPath, { progressivo: 1 });
  try {
    return JSON.parse(fs.readFileSync(bolleEntrataPath, 'utf8')) || { progressivo: 1 };
  } catch {
    const initial = { progressivo: 1 };
    fs.writeFileSync(bolleEntrataPath, JSON.stringify(initial, null, 2));
    return initial;
  }
}
function saveBolleEntrata(prog) {
  const record = { progressivo: prog };
  fs.writeFileSync(bolleEntrataPath, JSON.stringify(record, null, 2));
  console.log('🚚 SALVATO bolle_in_entrata.json:', record);
}

// ───────────────────────────────────────────────────────────────────────────────
// Users (demo auth locale)
// ───────────────────────────────────────────────────────────────────────────────
const usersFilePath = path.join(__dirname, 'data', 'users.json');
const readUsers = () => (fs.existsSync(usersFilePath) ? JSON.parse(fs.readFileSync(usersFilePath, 'utf8') || '[]') : []);
const saveUsers = (users) => {
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
};

app.post('/api/register', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e password sono obbligatorie.' });
  const users = readUsers();
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(400).json({ error: 'Email già registrata.' });
  }
  const newUser = { email, password };
  users.push(newUser); saveUsers(users);
  console.log(`Nuovo utente registrato: ${email}`);
  res.json({ message: 'Registrazione completata!', user: newUser });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e password sono obbligatorie.' });
  const users = readUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
  if (!user) return res.status(401).json({ error: 'Credenziali non valide.' });
  console.log(`Utente loggato: ${email}`);
  res.json({ message: 'Login effettuato con successo!', user });
  if (!activeUsers.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    activeUsers.push({ email, lastPing: Date.now() });
    notifyActiveUsers();
  }
});

app.post('/api/logout', (req, res) => {
  const { email } = req.body;
  activeUsers = activeUsers.filter(u => u.email.toLowerCase() !== String(email).toLowerCase());
  notifyActiveUsers();
  res.json({ message: 'Logout effettuato con successo!' });
});

app.post('/api/ping', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email mancante' });
  const user = activeUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (user) user.lastPing = Date.now(); else activeUsers.push({ email, lastPing: Date.now() });
  notifyActiveUsers();
  res.json({ message: 'Ping ricevuto' });
});

// ───────────────────────────────────────────────────────────────────────────────
// Utility locali
// ───────────────────────────────────────────────────────────────────────────────
app.post('/api/open-folder-local', (req, res) => {
  const { folderPath } = req.body;
  if (!folderPath) return res.status(400).json({ message: 'Percorso mancante' });
  const cmdFile = 'C:\\Users\\Applicazioni\\Gestione Commesse\\data\\apptimepass_cmd.json';
  try {
    fs.writeFileSync(cmdFile, JSON.stringify({ action: 'open_folder', folder: folderPath }, null, 2));
    res.json({ message: 'Comando scritto, la cartella si aprirà a breve!' });
  } catch (err) {
    res.status(500).json({ message: 'Errore scrivendo il file comando.', error: err.toString() });
  }
});

// ───────────────────────────────────────────────────────────────────────────────
// Upload report (PDF/Excel) in cartelle commessa
// ───────────────────────────────────────────────────────────────────────────────
app.post('/api/save-pdf-report', (req, res) => {
  const { folderPath, pdfData, fileName } = req.body;
  if (!folderPath || !pdfData) return res.status(400).json({ message: "I parametri 'folderPath' e 'pdfData' sono obbligatori." });
  if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

  const pdfPath = path.join(folderPath, fileName || 'report.pdf');
  const idx = pdfData.indexOf('base64,'); if (idx === -1) return res.status(400).json({ message: 'Formato di pdfData non valido.' });
  const pdfBuffer = Buffer.from(pdfData.substring(idx + 'base64,'.length), 'base64');

  fs.writeFile(pdfPath, pdfBuffer, (err) => {
    if (err) return res.status(500).json({ message: 'Errore nel salvataggio del PDF', error: err.toString() });
    res.json({ message: 'PDF salvato con successo!', path: pdfPath });
  });
});

app.post('/api/save-excel-report', (req, res) => {
  const { folderPath, excelData, fileName } = req.body;
  if (!folderPath || !excelData) return res.status(400).json({ message: "I parametri 'folderPath' e 'excelData' sono obbligatori." });
  if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

  const excelPath = path.join(folderPath, fileName || 'distinta_materiali.xlsx');
  const idx = excelData.indexOf('base64,'); if (idx === -1) return res.status(400).json({ message: 'Formato di excelData non valido.' });
  const excelBuffer = Buffer.from(excelData.substring(idx + 'base64,'.length), 'base64');

  fs.writeFile(excelPath, excelBuffer, (err) => {
    if (err) return res.status(500).json({ message: "Errore nel salvataggio dell'Excel", error: err.toString() });
    res.json({ message: 'Excel salvato con successo!', path: excelPath });
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// DDT Excel via Python
// ───────────────────────────────────────────────────────────────────────────────
app.post('/api/genera-ddt-excel', (req, res) => {
  try {
    const reportDdtPath = req.body.reportDdtPath || req.body.reportDdtBasePath || req.body.basePath;
    const datiDdtIn = req.body.datiDdt || req.body;
    if (!reportDdtPath || !datiDdtIn) return res.status(400).json({ error: 'reportDdtPath e datiDdt sono obbligatori' });

    let descrizione = (datiDdtIn.descrizione || '').trim();
    let nomeCommessa = (datiDdtIn.nomeCommessa || '').trim();

    const folderPath =
      datiDdtIn.folderPath ||
      datiDdtIn.percorso ||
      (datiDdtIn.percorsoPdf && path.dirname(datiDdtIn.percorsoPdf) && path.dirname(path.dirname(datiDdtIn.percorsoPdf)));

    if ((!descrizione || !nomeCommessa) && folderPath) {
      try {
        const reportFile = path.join(folderPath, 'report.json');
        if (fs.existsSync(reportFile)) {
          const rep = JSON.parse(fs.readFileSync(reportFile, 'utf8') || '{}');
          const nomeCartella = rep?.brand && rep?.nomeProdotto && rep?.codiceProgetto && rep?.codiceCommessa
            ? `${rep.brand}_${rep.nomeProdotto}_${rep.codiceProgetto}_${rep.codiceCommessa}` : '';
          if (!descrizione) descrizione = nomeCartella ? `Assembraggio ${nomeCartella}` : '';
          if (!nomeCommessa && nomeCartella) {
            const m = String(descrizione || (`Assembraggio ${nomeCartella}`)).split('_');
            if (m.length >= 3) nomeCommessa = m[1].trim();
          }
        }
      } catch (e) { console.warn('[/api/genera-ddt-excel] Warning leggendo report.json:', e.toString()); }
    }

    if (!nomeCommessa && descrizione) {
      const parti = String(descrizione).split('_'); if (parti.length >= 3) nomeCommessa = parti[1].trim();
    }
    if (!descrizione) {
      const brand = (datiDdtIn.brand || '').trim();
      const nomeProdotto = (datiDdtIn.nomeProdotto || '').trim();
      const codiceProgetto = (datiDdtIn.codiceProgetto || '').trim();
      const codiceCommessa = (datiDdtIn.codiceCommessa || '').trim();
      const nomeCartella = (brand && nomeProdotto && codiceProgetto && codiceCommessa) ? `${brand}_${nomeProdotto}_${codiceProgetto}_${codiceCommessa}` : '';
      descrizione = nomeCartella ? `Assembraggio ${nomeCartella}` : '';
    }

    const datiPerPython = { ...datiDdtIn, descrizione, nomeCommessa };
    const tempJsonPath = path.join(__dirname, 'data', `temp_ddt_${Date.now()}.json`);
    fs.writeFileSync(tempJsonPath, JSON.stringify(datiPerPython, null, 2), 'utf8');

    const pythonScript = path.join(__dirname, 'genera_excel_ddt.py');
    const proc = spawn(PYTHON_PATH, [pythonScript, tempJsonPath, reportDdtPath]);

    let stdoutData = '', stderrData = '';
    proc.stdout?.on('data', d => { stdoutData += d.toString(); });
    proc.stderr?.on('data', d => { stderrData += d.toString(); });

    proc.on('exit', (code) => {
      try { fs.unlinkSync(tempJsonPath); } catch {}
      if (stdoutData.includes('NON aggiornato')) return res.status(409).json({ message: stdoutData.trim(), debug: stdoutData });
      if (code === 0) return res.json({ message: 'Report Excel generato!', debug: stdoutData.trim() });
      return res.status(500).json({ error: `Python script failed (code ${code})`, stderr: stderrData, stdout: stdoutData });
    });

    proc.on('error', (err) => {
      try { fs.unlinkSync(tempJsonPath); } catch {}
      res.status(500).json({ error: err.toString() });
    });
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

// ───────────────────────────────────────────────────────────────────────────────
// File utils
// ───────────────────────────────────────────────────────────────────────────────
app.post('/api/lista-file', (req, res) => {
  const { folderPath } = req.body;
  if (!folderPath) return res.status(400).json({ error: 'folderPath mancante' });
  fs.readdir(folderPath, { withFileTypes: true }, (err, files) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(files.filter(f => f.isFile()).map(f => f.name));
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// Progressivi Bolle
// ───────────────────────────────────────────────────────────────────────────────
// Uscita (T): SOLO LETTURA, dopo sync (numero che vedresti oggi, senza avanzare)
app.get('/api/prossima-bolla', (req, res) => {
  try { syncProgressivi({ forT: true, forW: false }); } catch {}
  const bolle = getBolleUscita();
  res.json({ numeroBolla: String(bolle.progressivo).padStart(4, '0') });
});

// Uscita (T): AVANZA + reset auto al cambio giorno + nome file standard
app.post('/api/avanza-bolla', (req, res) => {
  try { syncProgressivi({ forT: true, forW: false }); } catch {}

  let bolle = getBolleUscita();
  const oggi = oggiISO();
  if (bolle.ultimaData !== oggi) { bolle = { progressivo: 1, ultimaData: oggi }; }
  const progressivo = bolle.progressivo;
  saveBolleUscita(progressivo + 1, oggi);

  // Nome file: DDT_<NNNNT>_<Cxxxx[-yy]>_<dd-mm-yyyy>.pdf
  const folderPath = req.body?.folderPath || '';
  const codiceVisivo = folderPath ? getCodiceCommessaVisuale(folderPath) : '';
  const suffissoC = codiceVisivo ? `_${codiceVisivo}` : '';
  const nomeFileSuggerito = `DDT_${String(progressivo).padStart(4,'0')}T${suffissoC}_${oggiStr()}.pdf`;

  const logLine = `[${new Date().toISOString()}] BOLLA generata - Numero: ${String(progressivo).padStart(4, '0')}T, Data: ${oggi}\n`;
  fs.appendFileSync(path.join(__dirname, 'data', 'bolle.log'), logLine);

  res.json({
    numeroBolla: String(progressivo).padStart(4, '0'),
    dataTrasporto: oggi,
    suggestedFileName: nomeFileSuggerito
  });
});


// Entrata: SOLO LETTURA (senza prefisso)
app.get('/api/prossima-bolla-entrata', (req, res) => {
  const bolle = getBolleEntrata();
  res.json({ numeroBolla: String(bolle.progressivo).padStart(4, '0') });
});

// Entrata: AVANZA (senza prefisso)
app.post('/api/avanza-bolla-entrata', (req, res) => {
  const bolle = getBolleEntrata();
  const progressivo = bolle.progressivo;
  saveBolleEntrata(progressivo + 1);
  res.json({ numeroBolla: String(progressivo).padStart(4, '0') });
});

// --- SYNC progressivi dai PDF esistenti (T = solo oggi, W = globale) ----------
function syncProgressivi({ forT = true, forW = true } = {}) {
  try {
    if (!fs.existsSync(settingsFilePath)) return;
    const settings = JSON.parse(fs.readFileSync(settingsFilePath, 'utf8') || '{}');
    const baseFolder = settings.percorsoCartella;
    if (!baseFolder || !fs.existsSync(baseFolder)) return;

    const patternCartella = /^([^_]+)_([^_]+)_([^_]+)_([^_]+)$/;
    const entries = fs.readdirSync(baseFolder, { withFileTypes: true });
    let maxT = 0, maxW = 0;

    const todayDash = oggiStr();               // dd-mm-yyyy
    const todayUnd  = todayDash.replace(/-/g, '_');

    const patT = [
      new RegExp(`^DDT_(\\d{4})T_.*_${todayDash}\\.pdf$`, 'i'),
      new RegExp(`^DDT_(\\d{4})T_.*_${todayUnd}\\.pdf$`,  'i'),
    ];
    const patW = [
      /^DDT_(\d{4})W_.*_(\d{2})-(\d{2})-(\d{4})\.pdf$/i,
      /^DDT_(\d{4})W_.*_(\d{2})_(\d{2})_(\d{4})\.pdf$/i,
    ];

    for (const e of entries) {
      if (!e.isDirectory() || !patternCartella.test(e.name)) continue;
      const materiali = path.join(baseFolder, e.name, 'MATERIALI');
      if (!fs.existsSync(materiali)) continue;

      for (const f of fs.readdirSync(materiali)) {
        if (forT) {
          for (const p of patT) {
            const m = f.match(p);
            if (m) { const n = parseInt(m[1], 10); if (n > maxT) maxT = n; break; }
          }
        }
        if (forW) {
          for (const p of patW) {
            const m = f.match(p);
            if (m) { const n = parseInt(m[1], 10); if (n > maxW) maxW = n; break; }
          }
        }
      }
    }

    if (forT) {
      // prossimo T = max odierno + 1, con reset quotidiano
      const nextT = (maxT || 0) + 1;
      saveBolleUscita(nextT, oggiISO());
    }
    if (forW) {
      // prossimo W = max globale + 1 (senza reset)
      const nextW = (maxW || 0) + 1;
      saveBolleEntrata(nextW);
    }
  } catch (e) {
    console.warn('[syncProgressivi] warning:', e?.message || String(e));
  }
}


// === UTIL per generare la Bolla ENTRATA (W) anche senza T ===
function pad4(n) { return String(n).padStart(4, '0'); }
function oggiStr() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth()+1)}-${d.getFullYear()}`; // dd-mm-yyyy
}
function oggiStrSlash() { return oggiStr().replace(/-/g, '/'); }       // dd/mm/yyyy
function escapeReg(s) { return String(s).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'); }

// Prendo 'Cxxxx-yy' da report.json se c'è, altrimenti dal nome cartella (..._Cxxxx-yy)
function getCodiceCommessaVisuale(folderPath) {
  try {
    const repPath = path.join(folderPath, 'report.json');
    if (fs.existsSync(repPath)) {
      const rep = JSON.parse(fs.readFileSync(repPath, 'utf8') || '{}');
      if (rep && typeof rep.codiceCommessa === 'string' && rep.codiceCommessa.trim()) {
        return rep.codiceCommessa.trim(); // es. C8888-11
      }
    }
  } catch {}
  const base = path.basename(folderPath);
  const m = base.match(/_C([A-Za-z0-9\-]+)$/);
  return m ? ('C' + m[1]) : '';
}

// Somma colli da report.json (fallback opzionale)
function getColliDaReportSync(folderPath, fallback = '') {
  try {
    const rf = path.join(folderPath, 'report.json');
    if (!fs.existsSync(rf)) return fallback;
    const data = JSON.parse(fs.readFileSync(rf, 'utf8') || '{}');
    if (data && Array.isArray(data.consegne) && data.consegne.length > 0) {
      let somma = 0;
      for (const c of data.consegne) {
        if (Array.isArray(c.bancali)) {
          somma += c.bancali.reduce((t, b) => t + (parseInt(b.quantiBancali) || 0), 0);
        }
      }
      if (somma > 0) return somma;
    }
    return fallback;
  } catch { return fallback; }
}

// Cerca la T più recente (opzionale): se non trovata, ritorna null
function findUscitaOptional(materialiPath, codiceVisivo) {
  try {
    const files = fs.readdirSync(materialiPath);
    let best = null; // { num, dd, mm, yyyy }
    const pats = [
      new RegExp(`^DDT_(\\d{4})T_.*${escapeReg(codiceVisivo)}_(\\d{2})-(\\d{2})-(\\d{4})\\.pdf$`, 'i'),
      new RegExp(`^DDT_(\\d{4})T_.*${escapeReg(codiceVisivo)}_(\\d{2})_(\\d{2})_(\\d{4})\\.pdf$`, 'i'),
    ];
    for (const f of files) {
      for (const pat of pats) {
        const m = f.match(pat);
        if (m) {
          const num = parseInt(m[1], 10);
          if (!best || num > best.num) best = { num, dd: m[2], mm: m[3], yyyy: m[4] };
          break;
        }
      }
    }
    if (!best) return null;
    return { numeroT: pad4(best.num) + 'T', dataT: `${best.dd}/${best.mm}/${best.yyyy}` };
  } catch { return null; }
}

// Core: genera il PDF W e lo salva in <cartella>/MATERIALI
// Funzione unica per DDT ENTRATA (manuale e automatica)
async function generaBollaEntrata({ folderPath, advance = true }) {

  try {
    if (!folderPath || !fs.existsSync(folderPath)) return { ok:false, error:'folderPath non valido' };
    const materialiPath = path.join(folderPath, 'MATERIALI');
    if (!fs.existsSync(materialiPath)) fs.mkdirSync(materialiPath, { recursive: true });

// sincronizza sempre prima di leggere/avanzare il progressivo W
try { syncProgressivi({ forT: false, forW: true }); } catch {}


    // progressivo ENTRATA (senza prefisso)
let numeroPuro;
if (advance) {
  const bolle = getBolleEntrata();
  numeroPuro = pad4(bolle.progressivo);
  saveBolleEntrata(bolle.progressivo + 1);
} else {
  // solo lettura del prossimo numero, senza avanzare
  const bolle = getBolleEntrata();
  numeroPuro = pad4(bolle.progressivo);
}


    // impostazioni: master ENTRATA
    if (!fs.existsSync(settingsFilePath)) return { ok:false, error:'impostazioni non trovate' };
    const settings = JSON.parse(fs.readFileSync(settingsFilePath, 'utf8') || '{}');
    const masterPDF = settings.masterBolleEntrata;
    if (!masterPDF || !fs.existsSync(masterPDF)) return { ok:false, error:'masterBolleEntrata non impostato/trovato' };

    // dati
    const codiceVisivo = getCodiceCommessaVisuale(folderPath); // es. C8888-11
    const numeroDoc = numeroPuro + 'W';
    const dataDocIT = new Date().toLocaleDateString('it-IT');
    const dataFile = oggiStr();
    const nomeFile = `DDT_${numeroPuro}W_${codiceVisivo}_${dataFile}.pdf`; // ✅ compatibile con regex Python
    const outPath = path.join(materialiPath, nomeFile);

    const baseName = path.basename(folderPath);
    const descrizione = 'Assembraggio ' + baseName;

    let quantita = '';
    try {
      const rep = JSON.parse(fs.readFileSync(path.join(folderPath, 'report.json'), 'utf8') || '{}');
      if (rep && (rep.quantita !== undefined && rep.quantita !== null)) quantita = String(rep.quantita);
    } catch {}
    const colli = getColliDaReportSync(folderPath, '');

    // T opzionale
const uscita = findUscitaOptional(materialiPath, codiceVisivo);
const nsDdt = uscita?.numeroT || '';

// ⬇️ questa è la data mostrata vicino a "Ns DDT ... del"
//    resta VUOTA se non esiste una T
const dataNsDdt = uscita?.dataT || '';

// ⬇️ queste sono le date operative (trasporto/ritiro)
//    se non c'è T, usano OGGI
const dataTrasportoRitiro = uscita?.dataT || dataDocIT;



    // compila PDF (se form presente)
    const pdfBytes = fs.readFileSync(masterPDF);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    try {
      const form = pdfDoc.getForm();
      const fields = form.getFields();
      for (const f of fields) {
        const name = f.getName();
        const lname = String(name).toLowerCase();
        try {
          if (lname.includes('numero documento')) { form.getTextField(name).setText(numeroDoc); continue; }
          if (lname.includes('data documento'))   { form.getTextField(name).setText(dataDocIT); continue; }
          if (name === 'Descrizione')             { form.getTextField(name).setText(descrizione); continue; }
          if (name === 'qta')                     { form.getTextField(name).setText(String(quantita ?? '')); continue; }
          if (name === 'colli')                   { form.getTextField(name).setText(String(colli ?? '')); continue; }
         if (name === 'Ns DDT')                  { form.getTextField(name).setText(nsDdt); continue; }

// ✅ data accanto a "Ns DDT": vuota se non c'è T
if (name === 'del')                     { form.getTextField(name).setText(dataNsDdt); continue; }

// ✅ date operative (trasporto/ritiro): fallback OGGI
if (name === 'Testo8')                  { form.getTextField(name).setText(dataTrasportoRitiro); continue; }
if (name === 'Testo9')                  { form.getTextField(name).setText(dataTrasportoRitiro); continue; }

// fallback su nomi campo alternativi
if (lname.includes('trasporto'))        { form.getTextField(name).setText(dataTrasportoRitiro); continue; }
if (lname.includes('ritiro'))           { form.getTextField(name).setText(dataTrasportoRitiro); continue; }


// extra fallback per campi chiamati in modo diverso
if (lname.includes('trasporto'))        { form.getTextField(name).setText(dataTrasportoRitiro); continue; }
if (lname.includes('ritiro'))           { form.getTextField(name).setText(dataTrasportoRitiro); continue; }

        } catch {}
      }
    } catch {} // PDF senza form: va bene, salviamo copia

    fs.writeFileSync(outPath, await pdfDoc.save());

    return {
      ok: true,
      path: outPath,
      fileName: nomeFile,
      numeroDoc,
      dataDocIT,
      codiceVisivo,
      materialiPath
    };
  } catch (e) {
    return { ok:false, error: e?.message || String(e) };
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// API unica per generare la Bolla di Entrata (manuale/automatica)
// ───────────────────────────────────────────────────────────────────────────────
app.post('/api/genera-bolla-entrata', async (req, res) => {
  try {
    const { folderPath, advance = true, reportDdtPath, extra } = req.body || {};
    if (!folderPath || !fs.existsSync(folderPath)) {
      return res.status(400).json({ ok:false, error: 'folderPath non valido' });
    }
    // usa la funzione unica
    const r = await generaBollaEntrata({ folderPath, advance });
    if (!r?.ok) return res.status(500).json({ ok:false, error: r?.error || 'Errore generazione PDF' });

    // opzionale: logga anche su Excel se passato reportDdtPath
    if (reportDdtPath && fs.existsSync(reportDdtPath)) {
      try {
        const datiReport = fs.existsSync(path.join(folderPath,'report.json'))
          ? JSON.parse(fs.readFileSync(path.join(folderPath,'report.json'), 'utf8') || '{}')
          : {};
        const payload = {
          reportDdtPath,
          datiDdt: {
            dataDdt: oggiStrSlash(),
            numeroDdt: r.numeroDoc,                    // "0001W"
            codiceCommessa: r.codiceVisivo,            // "C8888-11"
            quantita: (datiReport?.quantita ?? ''),
            colli: getColliDaReportSync(folderPath, ''),
            nsDdt: '',                                  // se vuoi popolare, usa findUscitaOptional come in generaBollaEntrata
            del: '',
            percorsoPdf: path.join(r.materialiPath, r.fileName),
            oreLavorazione: extra?.oreLavorazione ?? '',
            costoPz: extra?.costoPz ?? '',
            costoTot: extra?.costoTot ?? '',
            folderPath,
            descrizione: 'Assembraggio ' + path.basename(folderPath),
            nomeCommessa: path.basename(folderPath),
            prezzoVendita: (datiReport?.prezzoVendita ?? 0),
          }
        };
        fetch('http://127.0.0.1:3001/api/genera-ddt-excel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(() => {});
      } catch {}
    }

    res.json({ ok:true, ...r });
  } catch (e) {
    res.status(500).json({ ok:false, error: e?.message || String(e) });
  }
});



// ───────────────────────────────────────────────────────────────────────────────
// Gestione commesse
// ───────────────────────────────────────────────────────────────────────────────
let ultimoHashCommesse = null;
let percorsoCartellaMonitorata = null;
let monitorInterval = null;

const startMonitoring = () => {
  if (monitorInterval === null && percorsoCartellaMonitorata) {
    monitorInterval = setInterval(() => {
      const hashPrima = ultimoHashCommesse;
      refreshCommesseJSON(percorsoCartellaMonitorata);
      if (ultimoHashCommesse !== hashPrima) notifyClients();
    }, 30000);
    console.log('Monitoraggio avviato.');
  }
};
const stopMonitoring = () => { if (monitorInterval !== null) { clearInterval(monitorInterval); monitorInterval = null; } };

app.post('/api/monitor-folder', (req, res) => {
  const { percorsoCartella } = req.body;
  if (!percorsoCartella) return res.status(400).json({ message: 'Percorso cartella non specificato.' });
  if (!fs.existsSync(percorsoCartella)) return res.status(404).json({ message: 'Cartella non trovata.' });
  percorsoCartellaMonitorata = percorsoCartella;
  startMonitoring();
  monitorFile(path.join(percorsoCartella, 'commesse.json'));
  res.status(200).json({ message: 'Monitoraggio avviato con successo.' });
});

app.get('/api/commesse', (req, res) => {
  const { percorsoCartella } = req.query;
  if (!percorsoCartella) return res.status(400).json({ message: 'Percorso cartella non specificato.' });

  const jsonFilePath = path.join(percorsoCartella, 'commesse.json');
  if (!fs.existsSync(jsonFilePath)) fs.writeFileSync(jsonFilePath, JSON.stringify([], null, 2));

  try {
    const rawData = fs.readFileSync(jsonFilePath, 'utf8');
    let commesse = rawData.trim() ? JSON.parse(rawData) : [];

    // dedup per chiave "cartella"
    const uniqueMap = new Map();
    commesse.forEach(c => {
      const key = `${(c.brand||'').trim()}_${(c.nomeProdotto||'').trim()}_${(c.codiceProgetto||'').trim()}_${(c.codiceCommessa||'').trim()}`;
      if (!uniqueMap.has(key)) uniqueMap.set(key, c); else uniqueMap.get(key).presente = uniqueMap.get(key).presente || c.presente;
    });
    commesse = Array.from(uniqueMap.values());

    // rispecchia cartelle presenti
    const entries = fs.readdirSync(percorsoCartella, { withFileTypes: true });
    const pattern = /^([^_]+)_([^_]+)_([^_]+)_([^_]+)$/;
    const cartellePresenti = entries.filter(e => e.isDirectory() && pattern.test(e.name)).map(e => e.name.trim());

    cartellePresenti.forEach(cartella => {
      const m = pattern.exec(cartella);
      if (!m) return;
      const [_, brandVal, nomeProdottoVal, codiceProgettoVal, codiceCommessaVal] = m;
      const uniqueKey = `${brandVal}_${nomeProdottoVal}_${codiceProgettoVal}_${codiceCommessaVal}`;
      const found = commesse.find(c =>
        `${(c.brand||'').trim()}_${(c.nomeProdotto||'').trim()}_${(c.codiceProgetto||'').trim()}_${(c.codiceCommessa||'').trim()}` === uniqueKey
      );
      if (found) found.presente = true;
      else commesse.push({
        nome: cartella,
        cliente: '',
        brand: brandVal,
        nomeProdotto: nomeProdottoVal,
        quantita: 0,
        codiceProgetto: codiceProgettoVal,
        codiceCommessa: codiceCommessaVal,
        dataConsegna: '',
        presente: true,
        percorso: path.join(percorsoCartella, cartella)
      });
    });

    // merge archiviata/presente
    const finalMap = new Map();
    commesse.forEach(c => {
      c.archiviata = (c.archiviata === true || c.archiviata === 'true');
      const key = `${(c.brand||'').trim()}_${(c.nomeProdotto||'').trim()}_${(c.codiceProgetto||'').trim()}_${(c.codiceCommessa||'').trim()}`;
      if (!finalMap.has(key)) finalMap.set(key, c);
      else {
        const ex = finalMap.get(key);
        ex.archiviata = ex.archiviata || c.archiviata;
        ex.presente = ex.presente || c.presente;
      }
    });
    commesse = Array.from(finalMap.values());

    fs.writeFileSync(jsonFilePath, JSON.stringify(commesse, null, 2));
    res.status(200).json({ commesse });
  } catch (error) {
    console.error('❌ Errore nel recupero delle commesse:', error);
    res.status(500).json({ message: 'Errore nel recupero delle commesse.' });
  }
});

app.get('/api/commessa-dettagli', (req, res) => {
  const { percorsoCartella, commessaNome } = req.query;
  if (!percorsoCartella || !commessaNome) return res.status(400).json({ message: 'Parametri mancanti.' });
  const jsonFilePath = path.join(percorsoCartella, 'commesse.json');
  if (!fs.existsSync(jsonFilePath)) return res.status(404).json({ message: 'File JSON non trovato.' });
  try {
    const commesse = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8') || '[]');
    const commessa = commesse.find(c => `${c.brand}_${c.nomeProdotto}_${c.codiceProgetto}_${c.codiceCommessa}` === commessaNome);
    if (!commessa) return res.status(404).json({ message: 'Commessa non trovata.' });
    res.status(200).json(commessa);
  } catch (error) {
    res.status(500).json({ message: 'Errore nel recupero dei dettagli della commessa.' });
  }
});

const copyDirectory = (source, destination) => {
  try {
    if (!fs.existsSync(destination)) fs.mkdirSync(destination, { recursive: true });
    const entries = fs.readdirSync(source, { withFileTypes: true });
    for (let e of entries) {
      const src = path.join(source, e.name);
      const dst = path.join(destination, e.name);
      if (e.isDirectory()) copyDirectory(src, dst); else fs.copyFileSync(src, dst);
    }
  } catch (error) { console.error(`❌ Errore nella clonazione ${source}:`, error); }
};

app.post('/api/genera-commessa', (req, res) => {
  const { cliente, brand, nomeProdotto, quantita, codiceProgetto, codiceCommessa, dataConsegna, percorsoCartella, cartellaDaClonare, selectedCalendarData } = req.body;
  if (!cliente || !brand || !nomeProdotto || !codiceProgetto || !codiceCommessa || !percorsoCartella || !cartellaDaClonare)
    return res.status(400).json({ message: 'Tutti i campi obbligatori non sono stati compilati.' });

  const quantitaFinale = quantita || 0;
  const dataConsegnaFinale = dataConsegna || '';
  const folderName = `${brand}_${nomeProdotto}_${codiceProgetto}_${codiceCommessa}`;
  const folderPath = path.join(percorsoCartella, folderName);

  try {
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
      copyDirectory(cartellaDaClonare, folderPath);
    }
  } catch (error) {
    return res.status(500).json({ message: 'Errore nella creazione/clonazione della cartella.' });
  }

  const jsonFilePath = path.join(percorsoCartella, 'commesse.json');
  let commesseData = [];
  if (fs.existsSync(jsonFilePath)) {
    try { const raw = fs.readFileSync(jsonFilePath, 'utf8'); if (raw.trim()) commesseData = JSON.parse(raw); } catch {}
  }

  const nuovaCommessa = {
    nome: folderName, cliente, brand, nomeProdotto, quantita: quantitaFinale,
    codiceProgetto, codiceCommessa, dataConsegna: dataConsegnaFinale, percorso: folderPath
  };
  commesseData.push(nuovaCommessa);

  try {
    const nuovoContenuto = JSON.stringify(commesseData, null, 2);
    let vecchio = ''; if (fs.existsSync(jsonFilePath)) try { vecchio = fs.readFileSync(jsonFilePath, 'utf8'); } catch {}
    if (nuovoContenuto !== vecchio) fs.writeFileSync(jsonFilePath, nuovoContenuto);
  } catch (error) {
    return res.status(500).json({ message: 'Errore nel salvataggio della commessa.', error: error.toString() });
  }

  const report = { cliente, brand, nomeProdotto, quantita: quantitaFinale, codiceProgetto, codiceCommessa, dataConsegna: dataConsegnaFinale, selectedCalendarData };
  try { fs.writeFileSync(path.join(folderPath, 'report.json'), JSON.stringify(report, null, 2)); } catch {}

  res.status(200).json({ message: `Cartella ${folderName} creata con file JSON e report.json aggiornato!`, folderPath });
});

app.post('/api/modifica-commessa', (req, res) => {
  const { cartellaDaClonare, nomeOriginale, nuovaCommessa, percorsoCartella } = req.body;
  if (!cartellaDaClonare || !nomeOriginale || !nuovaCommessa || !percorsoCartella) return res.status(400).json({ message: 'Dati mancanti per la modifica.' });

  const jsonFilePath = path.join(percorsoCartella, 'commesse.json');
  if (!fs.existsSync(jsonFilePath)) return res.status(404).json({ message: 'File commesse non trovato.' });

  try {
    let commesse = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
    const index = commesse.findIndex(c => `${c.brand}_${c.nomeProdotto}_${c.codiceProgetto}_${c.codiceCommessa}` === nomeOriginale);
    if (index === -1) return res.status(404).json({ message: 'Commessa non trovata.' });

    const oldFolderPath = commesse[index].percorso;
    const newFolderName = `${nuovaCommessa.brand}_${nuovaCommessa.nomeProdotto}_${nuovaCommessa.codiceProgetto}_${nuovaCommessa.codiceCommessa}`;
    const newFolderPath = path.join(path.dirname(oldFolderPath), newFolderName);

    if (fs.existsSync(oldFolderPath)) fs.renameSync(oldFolderPath, newFolderPath);

    const reportFileOld = path.join(oldFolderPath, 'report.json');
    const reportFileNew = path.join(newFolderPath, 'report.json');

    let reportData = {};
    if (fs.existsSync(reportFileOld)) { try { reportData = JSON.parse(fs.readFileSync(reportFileOld, 'utf8')); } catch {} }
    reportData = {
      ...reportData,
      cliente: nuovaCommessa.cliente || reportData.cliente || '',
      brand: nuovaCommessa.brand || reportData.brand || '',
      nomeProdotto: nuovaCommessa.nomeProdotto || reportData.nomeProdotto || '',
      quantita: nuovaCommessa.quantita || reportData.quantita || 0,
      codiceProgetto: nuovaCommessa.codiceProgetto || reportData.codiceProgetto || '',
      codiceCommessa: nuovaCommessa.codiceCommessa || reportData.codiceCommessa || '',
      dataConsegna: nuovaCommessa.dataConsegna || reportData.dataConsegna || ''
    };
    try { fs.writeFileSync(reportFileNew, JSON.stringify(reportData, null, 2)); } catch {}

    commesse[index] = { ...commesse[index], ...nuovaCommessa, percorso: newFolderPath };

    try {
      const nuovoContenuto = JSON.stringify(commesse, null, 2);
      let vecchio = ''; if (fs.existsSync(jsonFilePath)) try { vecchio = fs.readFileSync(jsonFilePath, 'utf8'); } catch {}
      if (nuovoContenuto !== vecchio) fs.writeFileSync(jsonFilePath, nuovoContenuto);
    } catch (error) {
      return res.status(500).json({ message: 'Errore nel salvataggio della commessa.', error: error.toString() });
    }

    res.status(200).json({ message: 'Commessa aggiornata con successo.', commessa: commesse[index] });
    setTimeout(() => notifyClients(), 500);
    setTimeout(() => notifyClients(), 1000);
  } catch (error) {
    res.status(500).json({ message: 'Errore nel salvataggio della commessa.', error: error.toString() });
  }
});

app.post('/api/rinomina-cartella', (req, res) => {
  const { cartellaDaClonare, nomeVecchio, nomeNuovo } = req.body;
  if (!cartellaDaClonare || !nomeVecchio || !nomeNuovo) return res.status(400).json({ message: 'Dati mancanti per la rinomina.' });
  const vecchioPercorso = path.join(cartellaDaClonare, nomeVecchio);
  const nuovoPercorso = path.join(cartellaDaClonare, nomeNuovo);
  if (!fs.existsSync(vecchioPercorso)) return res.status(404).json({ message: 'Cartella originale non trovata.' });
  try { fs.renameSync(vecchioPercorso, nuovoPercorso); res.status(200).json({ message: 'Cartella rinominata con successo.' }); }
  catch (error) { res.status(500).json({ message: 'Errore nella rinomina della cartella.' }); }
});

app.delete('/api/cancella-commessa/:percorsoCartella/:commessaNome', (req, res) => {
  const { percorsoCartella, commessaNome } = req.params;
  if (!percorsoCartella || !commessaNome) return res.status(400).json({ message: 'Parametri mancanti per la cancellazione.' });
  const jsonFilePath = path.join(percorsoCartella, 'commesse.json');
  if (!fs.existsSync(jsonFilePath)) return res.status(404).json({ message: 'File commesse non trovato.' });

  let commesse;
  try { commesse = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8') || '[]'); } catch { return res.status(500).json({ message: 'Errore nella lettura del file JSON.' }); }
  const index = commesse.findIndex(c => c.nome === commessaNome);
  if (index === -1) return res.status(404).json({ message: 'Commessa non trovata.' });

  const folderPath = commesse[index].percorso;
  try { fs.rmSync(folderPath, { recursive: true, force: true }); } catch (error) { return res.status(500).json({ message: 'Errore cancellando la cartella.', error: error.toString() }); }
  commesse.splice(index, 1);
  try { fs.writeFileSync(jsonFilePath, JSON.stringify(commesse, null, 2)); }
  catch (error) { return res.status(500).json({ message: 'Errore aggiornando il file JSON.', error: error.toString() }); }
  res.status(200).json({ message: 'Commessa cancellata con successo.' });
});

// report.json get/set
app.get('/api/report', (req, res) => {
  const { folderPath } = req.query;
  if (!folderPath) return res.status(400).json({ message: 'Il parametro folderPath è obbligatorio.' });
  const reportFilePath = path.join(folderPath, 'report.json');
  if (!fs.existsSync(reportFilePath)) { try { fs.writeFileSync(reportFilePath, JSON.stringify({}, null, 2)); } catch (e) { return res.status(500).json({ message: 'Errore nella creazione del file report.json.' }); } }
  try { const reportData = JSON.parse(fs.readFileSync(reportFilePath, 'utf8') || '{}'); return res.status(200).json({ report: reportData }); }
  catch { return res.status(500).json({ message: 'Errore nella lettura del file report.json.' }); }
});

app.post('/api/report', (req, res) => {
  const { folderPath, reportData } = req.body;
  if (!folderPath || !reportData) return res.status(400).json({ message: 'I parametri folderPath e reportData sono obbligatori.' });
  const reportFilePath = path.join(folderPath, 'report.json');
  try {
    let existing = {};
    if (fs.existsSync(reportFilePath)) {
      const raw = fs.readFileSync(reportFilePath, 'utf8');
      existing = raw.trim() ? JSON.parse(raw) : {};
    }
    const merged = { ...existing, ...reportData };
    const nuovo = JSON.stringify(merged, null, 2);
    let vecchio = ''; if (fs.existsSync(reportFilePath)) try { vecchio = fs.readFileSync(reportFilePath, 'utf8'); } catch {}
    if (nuovo !== vecchio) fs.writeFileSync(reportFilePath, nuovo);

    const parentFolder = path.dirname(folderPath);
    refreshCommesseJSON(parentFolder);
    notifyClients();
// ── Trigger: se archiviata passa da false -> true, genera la W automaticamente
try {
  const prima = existing?.archiviata === true || existing?.archiviata === 'true';
  const dopo  = merged?.archiviata === true   || merged?.archiviata === 'true';
  if (!prima && dopo) {
    setTimeout(async () => {
      const r = await generaBollaEntrata({ folderPath, advance: true });

      if (!r?.ok) {
        console.warn('[auto-bolla-entrata] errore:', r?.error);
        return;
      }
      console.log('[auto-bolla-entrata] creata:', r.fileName);

      // (FACOLTATIVO) logga anche su Excel Work, se impostato il path in impostazioni
      try {
        const settings = fs.existsSync(settingsFilePath)
          ? JSON.parse(fs.readFileSync(settingsFilePath, 'utf8') || '{}')
          : {};
        const reportDdtPath = settings.reportDdtPath;
        if (reportDdtPath && fs.existsSync(reportDdtPath)) {
          const datiReport = fs.existsSync(path.join(folderPath,'report.json'))
            ? JSON.parse(fs.readFileSync(path.join(folderPath,'report.json'), 'utf8') || '{}')
            : {};
          const payload = {
            reportDdtPath,
            datiDdt: {
              dataDdt: oggiStrSlash(),
              numeroDdt: r.numeroDoc,
              codiceCommessa: r.codiceVisivo,         // es. C8888-11
              quantita: (datiReport?.quantita ?? ''),
              colli: getColliDaReportSync(folderPath, ''),
            nsDdt: '',   // resta vuoto se non c'è T
del: '',     // resta vuoto se non c'è T


              percorsoPdf: path.join(r.materialiPath, r.fileName),
              oreLavorazione: '',                      // se vuoi, qui puoi sommare le ore dal tuo report produzione
              costoPz: '',
              costoTot: '',
              folderPath: folderPath,
              descrizione: 'Assembraggio ' + path.basename(folderPath),
              nomeCommessa: path.basename(folderPath),
              prezzoVendita: (datiReport?.prezzoVendita ?? 0),
            }
          };
          // chiama il tuo stesso endpoint locale senza bloccare questa response
          fetch('http://127.0.0.1:3001/api/genera-ddt-excel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).catch(err => console.warn('[auto-bolla-entrata] Excel warn:', err?.message || String(err)));
        }
      } catch (e) {
        console.warn('[auto-bolla-entrata] Excel warn:', e?.message || String(e));
      }
    }, 0);
  }
} catch (e) {
  console.warn('[auto-bolla-entrata] warning:', e?.message || String(e));
}

    res.status(200).json({ message: 'Report aggiornato con successo.' });
  } catch (error) {
    res.status(500).json({ message: "Errore nell'aggiornamento del file report.json.", error: error.toString() });
  }
});

// Mantieni commesse.json allineato alle cartelle + report.json
function refreshCommesseJSON(percorsoCartella) {
  const jsonFilePath = path.join(percorsoCartella, 'commesse.json');
  let jsonData = [];
  if (fs.existsSync(jsonFilePath)) {
    try { const rawData = fs.readFileSync(jsonFilePath, 'utf8'); jsonData = rawData.trim() ? JSON.parse(rawData) : []; }
    catch (e) { console.error('❌ Errore nella lettura del file JSON:', e); }
  }
  const entries = fs.readdirSync(percorsoCartella, { withFileTypes: true });
  const pattern = /^([^_]+)_([^_]+)_([^_]+)_([^_]+)$/;
  const cartellePresenti = entries.filter(e => e.isDirectory() && pattern.test(e.name)).map(e => e.name.trim());

  const mapping = {}; jsonData.forEach(r => { mapping[r.nome] = r; });

  const nuovoArray = cartellePresenti.map(cartella => {
    let commessa = mapping[cartella] ? { ...mapping[cartella] } : {
      nome: cartella, cliente: '', brand: '', nomeProdotto: '', quantita: 0,
      codiceProgetto: '', codiceCommessa: '', dataConsegna: '', presente: true,
      percorso: path.join(percorsoCartella, cartella)
    };
    if (!commessa.brand || !commessa.nomeProdotto || !commessa.codiceProgetto || !commessa.codiceCommessa) {
      const m = pattern.exec(cartella);
      if (m) { commessa.brand = m[1]; commessa.nomeProdotto = m[2]; commessa.codiceProgetto = m[3]; commessa.codiceCommessa = m[4]; }
    }
    commessa.percorso = path.join(percorsoCartella, cartella);
    commessa.presente = true;

    const reportPath = path.join(percorsoCartella, cartella, 'report.json');
    if (fs.existsSync(reportPath)) {
      try {
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf8') || '{}');
        commessa.inizioProduzione = report.inizioProduzione || '';
        commessa.archiviata = report.archiviata === true || report.archiviata === 'true' || false;
        commessa.fineProduzioneEffettiva = report.fineProduzioneEffettiva || null;
      } catch (e) { console.error(`Errore nella lettura di report.json in ${cartella}:`, e); }
    } else {
      commessa.archiviata = !!commessa.archiviata;
    }
    return commessa;
  });

  try {
    const nuovoJson = JSON.stringify(nuovoArray, null, 2);
    const nuovoHash = crypto.createHash('md5').update(nuovoJson).digest('hex');
    if (nuovoHash === ultimoHashCommesse) return;
    ultimoHashCommesse = nuovoHash;
    fs.writeFileSync(jsonFilePath, nuovoJson);
  } catch (e) { console.error('❌ Errore nell’aggiornamento del file JSON:', e); }
}

function monitorFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  fs.watchFile(filePath, { interval: 1000 }, () => { notifyClients(); });
}

function notifyClients() {
  if (!percorsoCartellaMonitorata) return;
  const jsonFilePath = path.join(percorsoCartellaMonitorata, 'commesse.json');
  if (!fs.existsSync(jsonFilePath)) return;
  try {
    const commesse = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8') || '[]');
    const commesseConStato = commesse.map(c => ({ ...c, nome: c.nome || `${c.brand}_${c.nomeProdotto}_${c.codiceProgetto}_${c.codiceCommessa}` }));
    wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(commesseConStato)); });
  } catch (e) { console.error('❌ Errore nella lettura del file JSON:', e); }
}

// Check report.json nelle cartelle all’avvio (se impostato percorsoCartella)
function checkAllReportFiles() {
  if (!fs.existsSync(settingsFilePath)) return;
  let settingsData;
  try { settingsData = JSON.parse(fs.readFileSync(settingsFilePath, 'utf8')); } catch { return; }
  const baseFolder = settingsData.percorsoCartella;
  if (!baseFolder || !fs.existsSync(baseFolder)) return;
  const entries = fs.readdirSync(baseFolder, { withFileTypes: true });
  entries.forEach(entry => {
    if (!entry.isDirectory()) return;
    const folderPath = path.join(baseFolder, entry.name);
    const reportFilePath = path.join(folderPath, 'report.json');
    if (!fs.existsSync(reportFilePath)) { try { fs.writeFileSync(reportFilePath, JSON.stringify({}, null, 2)); } catch {} }
  });
}

// ───────────────────────────────────────────────────────────────────────────────
// Impostazioni generali app
// ───────────────────────────────────────────────────────────────────────────────
app.post('/api/save-settings', (req, res) => {
  const {
    percorsoCartella, cartellaDaClonare,
    emailDestinatariApertura, emailDestinatariLavorazione,
    emailOggetto, emailContenuto,
    masterBolleUscita, masterBolleEntrata,
    reportDdtPath
  } = req.body;

  const settingsData = {
    percorsoCartella, cartellaDaClonare,
    emailDestinatariApertura, emailDestinatariLavorazione,
    emailOggetto, emailContenuto,
    masterBolleUscita, masterBolleEntrata,
    reportDdtPath
  };

  try {
    fs.writeFileSync(settingsFilePath, JSON.stringify(settingsData, null, 2));
    console.log('✅ Impostazioni salvate in', settingsFilePath);
    res.json({ message: 'Impostazioni salvate con successo.' });
  } catch (err) {
    res.status(500).json({ message: 'Errore nel salvataggio delle impostazioni.', error: err.toString() });
  }
});

app.get('/api/leggi-impostazioni', (req, res) => {
  if (!fs.existsSync(settingsFilePath)) return res.status(404).json({ message: 'File delle impostazioni non trovato.' });
  try { const settings = JSON.parse(fs.readFileSync(settingsFilePath, 'utf8') || '{}'); return res.status(200).json({ settings }); }
  catch (error) { return res.status(500).json({ message: 'Errore nella lettura delle impostazioni.', error: error.toString() }); }
});

// restituisce master PDF (uscita/entrata)
app.get('/api/master-bolla', (req, res) => {
  const tipo = req.query.tipo;
  if (!tipo || (tipo !== 'uscita' && tipo !== 'entrata')) return res.status(400).send('Tipo non valido. Usa ?tipo=uscita oppure ?tipo=entrata');
  if (!fs.existsSync(settingsFilePath)) return res.status(404).send('Impostazioni non trovate');
  const settings = JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'));
  const pathPDF = tipo === 'uscita' ? settings.masterBolleUscita : settings.masterBolleEntrata;
  if (!pathPDF || !fs.existsSync(pathPDF)) return res.status(404).send('File master PDF non trovato o non impostato');
  res.sendFile(path.resolve(pathPDF));
});

// ───────────────────────────────────────────────────────────────────────────────
// Stampanti – report generale
// ───────────────────────────────────────────────────────────────────────────────
app.get('/api/stampanti-parsed', (req, res) => {
  const parsedPath = path.join(__dirname, 'data', 'stampanti_parsed.json');
  if (!fs.existsSync(parsedPath)) return res.status(404).json({ message: 'Nessun file parsato ancora.' });
  const data = fs.readFileSync(parsedPath, 'utf8');
  res.json(JSON.parse(data));
});

app.get('/api/stampanti/settings', (req, res) => {
  const settingsPath = path.join(__dirname, 'data', 'stampantiSettings.json');
  if (!fs.existsSync(settingsPath)) return res.json({});
  try { res.json(JSON.parse(fs.readFileSync(settingsPath, 'utf8'))); }
  catch { res.status(500).json({ error: 'Impossibile leggere le impostazioni' }); }
});

app.post('/api/stampanti/settings', (req, res) => {
  const { printers, monitorJsonPath, reportGeneralePath } = req.body;
  const settingsDir = path.join(__dirname, 'data');
  if (!fs.existsSync(settingsDir)) fs.mkdirSync(settingsDir, { recursive: true });
  const toSave = { printers: Array.isArray(printers) ? printers : [], monitorJsonPath: monitorJsonPath || '', reportGeneralePath: reportGeneralePath || '' };
  fs.writeFileSync(path.join(settingsDir, 'stampantiSettings.json'), JSON.stringify(toSave, null, 2));
  res.json({ ok: true });
});

app.get('/api/stampanti/latest-csv', (req, res) => {
  const folder = req.query.folder;
  if (!folder) return res.status(400).json({ error: 'folder missing' });
  try {
    const files = fs.readdirSync(folder).filter(f => f.toLowerCase().endsWith('.csv'));
    if (!files.length) return res.json({ headers: [], rows: [] });
    const latest = files.map(name => ({ name, mtime: fs.statSync(path.join(folder, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)[0].name;

    const content = fs.readFileSync(path.join(folder, latest), 'utf8').trim();
    const lines = content.split(/\r?\n/);
    if (!lines.length) return res.json({ headers: [], rows: [] });

    const rawHeaders = lines[0].split(';').map(f => f.trim().replace(/^"|"$/g, ''));
    const rawRows = lines.slice(1).map(line => line.split(';').map(f => f.trim().replace(/^"|"$/g, '')));
    res.json({ headers: rawHeaders, rows: rawRows });
  } catch (err) { res.status(500).json({ error: err.toString() }); }
});

// storico settimanale
app.get('/api/storico-settimana', (req, res) => {
  const settingsPath = path.join(__dirname, 'data', 'stampantiSettings.json');
  let reportGeneralePath = path.join(__dirname, 'data');
  if (fs.existsSync(settingsPath)) {
    try { const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); reportGeneralePath = settings.reportGeneralePath || reportGeneralePath; }
    catch {}
  }
  let week = parseInt(req.query.week), year = parseInt(req.query.year);
  const now = new Date();
  function getWeekNumber(d) { d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1)); return Math.ceil((((d - yearStart) / 86400000) + 1)/7); }
  if (!week) week = getWeekNumber(now);
  if (!year) year = now.getFullYear();

  const file = path.join(reportGeneralePath, `Reportgenerali_Stampanti_${week}_${year}.json`);
  if (!fs.existsSync(file)) return res.json([]);
  try { return res.json(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { return res.json([]); }
});

// serve file dalla cartella reportGeneralePath
app.get('/report_generale/:nomefile', (req, res) => {
  const settingsPath = path.join(__dirname, 'data', 'stampantiSettings.json');
  if (!fs.existsSync(settingsPath)) return res.status(404).send('Impostazioni non trovate');
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const reportGeneralePath = settings.reportGeneralePath;
    if (!reportGeneralePath || !fs.existsSync(reportGeneralePath)) return res.status(404).send('Cartella REPORT GENERALE non trovata!');
    const filePath = path.join(reportGeneralePath, req.params.nomefile);
    if (!fs.existsSync(filePath)) return res.status(404).send('File non trovato');
    res.sendFile(filePath);
  } catch { return res.status(500).send('Errore interno nel recupero del file'); }
});

// rigenera settimanale manuale
app.post('/api/rigenera-report-settimanale', async (req, res) => {
  try {
    const now = new Date();
    const getISOWeek = (date) => { const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return Math.ceil((((d - yearStart) / 86400000) + 1) / 7); };
    const getISOWeekYear = (date) => { const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); return d.getUTCFullYear(); };
    const week = Number(req.query.week ?? req.body?.week ?? getISOWeek(now));
    const year = Number(req.query.year ?? req.body?.year ?? getISOWeekYear(now));
    await rigeneraSettimana(week, year);
    res.json({ ok: true, week, year, message: `Reportgenerali_Stampanti_${week}_${year}.json rigenerato` });
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

// elenco settimanali disponibili
app.get('/api/settimanali-disponibili', (req, res) => {
  const settingsPath = path.join(__dirname, 'data', 'stampantiSettings.json');
  let reportGeneralePath = path.join(__dirname, 'data');
  if (fs.existsSync(settingsPath)) { try { const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); if (s.reportGeneralePath) reportGeneralePath = s.reportGeneralePath; } catch {} }
  const files = fs.readdirSync(reportGeneralePath).filter(f => /^Reportgenerali_Stampanti_(\d+)_(\d+)\.json$/.test(f));
  const settimane = files.map(f => { const m = f.match(/^Reportgenerali_Stampanti_(\d+)_(\d+)\.json$/); return m ? { week: Number(m[1]), year: Number(m[2]), filename: f } : null; })
    .filter(Boolean).sort((a, b) => b.year - a.year || b.week - a.week);
  res.json(settimane);
});

// ───────────────────────────────────────────────────────────────────────────────
// PROTEK – settings + CSV grezzi
// ───────────────────────────────────────────────────────────────────────────────
app.post('/api/protek/settings', (req, res) => {
  const { monitorPath, pantografi } = req.body;
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const protekSettingsFile = path.join(dataDir, 'Proteksetting.json');
  try {
    fs.writeFileSync(protekSettingsFile, JSON.stringify({ monitorPath, pantografi: pantografi || [] }, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.toString() }); }
});

app.get('/api/protek/settings', (req, res) => {
  const file = path.join(__dirname, 'data', 'Proteksetting.json');
  if (!fs.existsSync(file)) return res.json({ monitorPath: '', pantografi: [] });
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    res.json({ monitorPath: data.monitorPath || '', pantografi: data.pantografi || [] });
  } catch { res.json({ monitorPath: '', pantografi: [] }); }
});

function readProtekSettings() {
  const file = path.join(__dirname, 'data', 'Proteksetting.json');
  if (!fs.existsSync(file)) return { monitorPath: '', pantografi: [] };
  try { const data = JSON.parse(fs.readFileSync(file, 'utf8')); return { monitorPath: data.monitorPath || '', pantografi: Array.isArray(data.pantografi) ? data.pantografi : [] }; }
  catch { return { monitorPath: '', pantografi: [] }; }
}
function detectDelimiter(firstLine) { const sc = (firstLine.match(/;/g) || []).length; const cc = (firstLine.match(/,/g) || []).length; return sc >= cc ? ';' : ','; }
function csvToObjects(csvText) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim() !== ''); if (!lines.length) return [];
  const delimiter = detectDelimiter(lines[0]);
  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const cols = line.split(delimiter).map(c => c.trim().replace(/^"|"$/g, ''));
    const obj = {}; headers.forEach((h, i) => { obj[h || `col_${i}`] = cols[i] ?? ''; }); return obj;
  });
}
function loadCSVFrom(folder, filename) {
  const full = path.join(folder, filename);
  if (!fs.existsSync(full)) return [];
  try { const raw = fs.readFileSync(full, 'utf8'); return csvToObjects(raw); } catch (e) { console.error(`[PROTEK] Errore leggendo ${filename}:`, e.toString()); return []; }
}

app.get('/api/protek/csv', (req, res) => {
  const { monitorPath } = readProtekSettings();
  if (!monitorPath || !fs.existsSync(monitorPath)) return res.status(404).json({ error: 'Percorso di monitoraggio Protek non impostato o non esistente.' });

  const files = {
    JOBS: 'JOBS.csv',
    JOB_ORDERS: 'JOB_ORDERS.csv',
    PART_PROGRAMS: 'PART_PROGRAMS.csv',
    PART_SUB_PROGRAMS: 'PART_SUB_PROGRAMS.csv',
    PART_PROGRAM_WORKINGS: 'PART_PROGRAM_WORKINGS.csv',
    PART_PROGRAM_WORKING_LINES: 'PART_PROGRAM_WORKING_LINES.csv',
    NESTINGS_ORDERS: 'NESTINGS_ORDERS.csv',
    NESTING_OCCURENCES: 'NESTING_OCCURENCES.csv',
    LIFECYCLE: 'LIFECYCLE.csv'
  };

  const payload = {};
  for (const [key, filename] of Object.entries(files)) payload[key] = loadCSVFrom(monitorPath, filename);
  payload.__meta = { monitorPath, loadedAt: new Date().toISOString() };
  res.json(payload);
});

// === PROTEK: lettura CSV passando il percorso direttamente dal client ==========
app.post('/api/protek/csv-direct', (req, res) => {
  const monitorPath = (req.body?.monitorPath || req.query?.monitorPath || '').trim();
  if (!monitorPath || !fs.existsSync(monitorPath)) {
    return res.status(404).json({ error: 'Percorso CSV non valido o non raggiungibile.' });
  }
  const files = {
    JOBS: 'JOBS.csv',
    JOB_ORDERS: 'JOB_ORDERS.csv',
    PART_PROGRAMS: 'PART_PROGRAMS.csv',
    PART_SUB_PROGRAMS: 'PART_SUB_PROGRAMS.csv',
    PART_PROGRAM_WORKINGS: 'PART_PROGRAM_WORKINGS.csv',
    PART_PROGRAM_WORKING_LINES: 'PART_PROGRAM_WORKING_LINES.csv',
    NESTINGS_ORDERS: 'NESTINGS_ORDERS.csv',
    NESTING_OCCURENCES: 'NESTING_OCCURENCES.csv',
    LIFECYCLE: 'LIFECYCLE.csv'
  };
  const payload = {};
  for (const [key, filename] of Object.entries(files)) {
    payload[key] = loadCSVFrom(monitorPath, filename);
  }
  payload.__meta = { monitorPath, loadedAt: new Date().toISOString() };
  res.json(payload);
});

// === PROTEK: vista unificata JOBS passando il percorso direttamente dal client ==
app.post('/api/protek/jobs-direct', (req, res) => {
  const monitorPath = (req.body?.monitorPath || req.query?.monitorPath || '').trim();
  if (!monitorPath || !fs.existsSync(monitorPath)) {
    return res.status(404).json({ error: 'Percorso CSV non valido o non raggiungibile.' });
  }
  const JOBS               = loadCSVFrom(monitorPath, 'JOBS.csv');
  const JOB_ORDERS         = loadCSVFrom(monitorPath, 'JOB_ORDERS.csv');
  const NESTINGS_ORDERS    = loadCSVFrom(monitorPath, 'NESTINGS_ORDERS.csv');
  const LIFECYCLE          = loadCSVFrom(monitorPath, 'LIFECYCLE.csv');

  const ordersByJobId = new Map();
  JOB_ORDERS.forEach(o => {
    const k = String(o.JOB_ID);
    if (!ordersByJobId.has(k)) ordersByJobId.set(k, []);
    ordersByJobId.get(k).push(o);
  });

  const nestingsByOrderId = new Map();
  NESTINGS_ORDERS.forEach(n => {
    const k = String(n.JOB_ORDER_ID);
    if (!nestingsByOrderId.has(k)) nestingsByOrderId.set(k, []);
    nestingsByOrderId.get(k).push(n);
  });

  function latestByEntity(type) {
    const map = new Map();
    LIFECYCLE
      .filter(r => String(r.ENTITY_TYPE).toUpperCase() === String(type).toUpperCase())
      .forEach(r => {
        const id = String(r.ENTITY_ID);
        const ts = new Date(r.TIMESTAMP || r.timestamp || 0).getTime();
        const prev = map.get(id);
        if (!prev || ts > new Date(prev.TIMESTAMP || prev.timestamp || 0).getTime()) {
          map.set(id, r);
        }
      });
    return map;
  }
  const lastJobLifecycle      = latestByEntity('JOB');
  const lastJobOrderLifecycle = latestByEntity('JOB_ORDER');

  const toInt = v => (v === undefined || v === null || v === '' || isNaN(Number(v))) ? 0 : parseInt(v, 10);

  const out = JOBS.map(job => {
    const jobId   = String(job.ID);
    const ords = (ordersByJobId.get(jobId) || []).map(o => {
      const orderId = String(o.ID);
      const qty     = toInt(o.QTY);
      const nestings = (nestingsByOrderId.get(orderId) || []);
      const pieces  = nestings.reduce((acc, n) => acc + toInt(n.PIECES || n.PIECE_COUNT), 0);
      const lc      = lastJobOrderLifecycle.get(orderId);
      return {
        id: orderId,
        code: o.ORDER_CODE || o.CODE || '',
        qtyOrdered: qty,
        piecesFromNestings: pieces,
        latestState: lc ? (lc.STATE || lc.STATUS || '') : ''
      };
    });
    const jobLc = lastJobLifecycle.get(jobId);
    return {
      id: jobId,
      code: job.CODE || '',
      description: job.DESCRIPTION || '',
      customer: job.CUSTOMER || '',
      latestState: jobLc ? (jobLc.STATE || jobLc.STATUS || '') : '',
      totals: {
        qtyOrdered: ords.reduce((a, o) => a + o.qtyOrdered, 0),
        piecesFromNestings: ords.reduce((a, o) => a + o.piecesFromNestings, 0)
      },
      orders: ords
    };
  });

  res.json({ jobs: out, meta: { monitorPath, generatedAt: new Date().toISOString() } });
});

// === PROTEK: endpoint unificato /api/protek/jobs ===============================
app.get('/api/protek/jobs', (req, res) => {
  const { monitorPath } = readProtekSettings();
  if (!monitorPath || !fs.existsSync(monitorPath)) {
    return res.status(404).json({ error: 'Percorso di monitoraggio Protek non impostato o non esistente.' });
  }

  const JOBS                  = loadCSVFrom(monitorPath, 'JOBS.csv');
  const JOB_ORDERS            = loadCSVFrom(monitorPath, 'JOB_ORDERS.csv');
  const PART_PROGRAMS         = loadCSVFrom(monitorPath, 'PART_PROGRAMS.csv');
  const NESTINGS_ORDERS       = loadCSVFrom(monitorPath, 'NESTINGS_ORDERS.csv');
  const NESTING_OCCURENCES    = loadCSVFrom(monitorPath, 'NESTING_OCCURENCES.csv');
  const LIFECYCLE             = loadCSVFrom(monitorPath, 'LIFECYCLE.csv');

  const jobById = new Map(JOBS.map(j => [String(j.ID), j]));
  const ordersByJobId = new Map();
  JOB_ORDERS.forEach(o => {
    const k = String(o.JOB_ID);
    if (!ordersByJobId.has(k)) ordersByJobId.set(k, []);
    ordersByJobId.get(k).push(o);
  });

  function latestByEntity(type) {
    const map = new Map();
    LIFECYCLE
      .filter(r => String(r.ENTITY_TYPE).toUpperCase() === String(type).toUpperCase())
      .forEach(r => {
        const id = String(r.ENTITY_ID);
        const ts = new Date(r.TIMESTAMP || r.timestamp || 0).getTime();
        const prev = map.get(id);
        if (!prev || ts > new Date(prev.TIMESTAMP || prev.timestamp || 0).getTime()) {
          map.set(id, r);
        }
      });
    return map;
  }
  const lastJobLifecycle      = latestByEntity('JOB');
  const lastJobOrderLifecycle = latestByEntity('JOB_ORDER');

  const nestingsByOrderId = new Map();
  NESTINGS_ORDERS.forEach(n => {
    const k = String(n.JOB_ORDER_ID);
    if (!nestingsByOrderId.has(k)) nestingsByOrderId.set(k, []);
    nestingsByOrderId.get(k).push(n);
  });

  const toInt = v => (v === undefined || v === null || v === '' || isNaN(Number(v))) ? 0 : parseInt(v, 10);

  const out = JOBS.map(job => {
    const jobId   = String(job.ID);
    const jobCode = job.CODE || '';
    const jobDesc = job.DESCRIPTION || '';
    const customer= job.CUSTOMER || '';

    const ords = (ordersByJobId.get(jobId) || []).map(o => {
      const orderId   = String(o.ID);
      const orderCode = o.ORDER_CODE || o.CODE || '';
      const qty       = toInt(o.QTY);

      const nestings  = (nestingsByOrderId.get(orderId) || []);
      const piecesFromNestings = nestings.reduce((acc, n) => acc + toInt(n.PIECES || n.PIECE_COUNT), 0);

      const lc = lastJobOrderLifecycle.get(orderId);
      const orderState = lc ? (lc.STATE || lc.STATUS || '') : '';

      return {
        id: orderId,
        code: orderCode,
        qtyOrdered: qty,
        piecesFromNestings,
        latestState: orderState
      };
    });

    const jobLc = lastJobLifecycle.get(jobId);
    const jobState = jobLc ? (jobLc.STATE || jobLc.STATUS || '') : '';

    const qtyOrderedTot = ords.reduce((a, o) => a + toInt(o.qtyOrdered), 0);
    const piecesTot     = ords.reduce((a, o) => a + toInt(o.piecesFromNestings), 0);

    return {
      id: jobId,
      code: jobCode,
      description: jobDesc,
      customer,
      latestState: jobState,
      totals: {
        qtyOrdered: qtyOrderedTot,
        piecesFromNestings: piecesTot
      },
      orders: ords
    };
  });

  res.json({ jobs: out, meta: { monitorPath, generatedAt: new Date().toISOString() } });
});

// === PROTEK: riepilogo PROGRAMMI (PART_PROGRAM) con inizio/fine =================
app.get('/api/protek/programs', (req, res) => {
  const { monitorPath } = readProtekSettings();
  if (!monitorPath || !fs.existsSync(monitorPath)) {
    return res.status(404).json({ error: 'Percorso di monitoraggio Protek non impostato o non esistente.' });
  }

  // Carico i CSV necessari
  const PART_PROGRAMS         = loadCSVFrom(monitorPath, 'PART_PROGRAMS.csv');          // ID, CODE, DESCRIPTION, CREATION_DATE, ...
  const PART_PROGRAM_WORKINGS = loadCSVFrom(monitorPath, 'PART_PROGRAM_WORKINGS.csv');  // PART_PROGRAM_ID, TIME, ...
  const LIFECYCLE             = loadCSVFrom(monitorPath, 'LIFECYCLE.csv');              // ENTITY_TYPE, ENTITY_ID, STATE, TIMESTAMP, ...

  // Helpers ---------------------------------------------------------------------
  const toNum = (v) =>
    (v === undefined || v === null || v === '' || isNaN(Number(v))) ? 0 : Number(v);

  const parseTs = (v) => {
    if (!v) return null;
    const t = new Date(v);
    return isNaN(t.getTime()) ? null : t;
  };

  // Stati che contano come start/end (normalizzati a UPPERCASE)
  const START_STATES = new Set(['START', 'STARTED', 'RUN', 'RUNNING', 'RESUMED', 'IN_PROGRESS', 'EXECUTING']);
  const END_STATES   = new Set(['END', 'ENDED', 'FINISH', 'FINISHED', 'COMPLETE', 'COMPLETED', 'STOPPED', 'ABORTED', 'CLOSED']);

  // Indice lifecycle: per ogni PART_PROGRAM_ID raccogliamo info utili
  const lifecycleByProgram = new Map(); // id -> { startTs: Date|null, endTs: Date|null, latestState: string, latestTs: Date|null }
  LIFECYCLE
    .filter(r => String(r.ENTITY_TYPE).toUpperCase() === 'PART_PROGRAM')
    .forEach(r => {
      const id = String(r.ENTITY_ID);
      const ts = parseTs(r.TIMESTAMP || r.timestamp);
      const state = String(r.STATE || r.STATUS || '').toUpperCase();
      if (!ts) return;

      if (!lifecycleByProgram.has(id)) {
        lifecycleByProgram.set(id, { startTs: null, endTs: null, latestState: '', latestTs: null });
      }
      const bucket = lifecycleByProgram.get(id);

      // primo "vero" inizio (min tra start-states)
      if (START_STATES.has(state)) {
        if (!bucket.startTs || ts < bucket.startTs) bucket.startTs = ts;
      }

      // ultimo "vero" fine (max tra end-states)
      if (END_STATES.has(state)) {
        if (!bucket.endTs || ts > bucket.endTs) bucket.endTs = ts;
      }

      // stato più recente (indipendentemente)
      if (!bucket.latestTs || ts > bucket.latestTs) {
        bucket.latestTs = ts;
        bucket.latestState = String(r.STATE || r.STATUS || '');
      }
    });

  // Output ----------------------------------------------------------------------
  const programs = PART_PROGRAMS.map(p => {
    const id          = String(p.ID);
    const code        = p.CODE || '';
    const description = p.DESCRIPTION || '';

    // CREATION_DATE come fallback di inizio se mancano eventi start
    const creationDate = parseTs(p.CREATION_DATE || p.creation_date);

    // Working time aggregato
    const workings = PART_PROGRAM_WORKINGS.filter(w => String(w.PART_PROGRAM_ID) === id);
    const totalTime = workings.reduce((acc, w) => acc + toNum(w.TIME), 0); // in secondi (presunto)
    const numWorkings = workings.length;

    // Lifecycle info
    const lc = lifecycleByProgram.get(id) || { startTs: null, endTs: null, latestState: '' };
    const startTime = lc.startTs || creationDate || null;    // preferisci start reale, poi creation
    const endTime   = lc.endTs   || null;                    // fine reale se presente

    // Durata "visuale": se abbiamo totalTime usiamo quello; altrimenti differenza tra start/fine
    let durationSeconds = 0;
    if (totalTime > 0) {
      durationSeconds = Math.floor(totalTime);
    } else if (startTime && endTime) {
      durationSeconds = Math.max(0, Math.floor((endTime - startTime) / 1000));
    }

    return {
      id,
      code,
      description,
      creationDate: creationDate ? creationDate.toISOString() : '',

      // nuovi campi richiesti
      startTime: startTime ? startTime.toISOString() : '',
      endTime:   endTime   ? endTime.toISOString()   : '',

      latestState: lc.latestState || '',
      totalTime: durationSeconds,     // in secondi (frontend può formattare hh:mm:ss)
      numWorkings
    };
  });

  res.json({ programs, meta: { monitorPath, generatedAt: new Date().toISOString() } });
});

// ───────────────────────────────────────────────────────────────────────────────
// WebSocket
// ───────────────────────────────────────────────────────────────────────────────
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('🟢 WebSocket CONNESSO!');
  startMonitoring();

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'auth') {
        if (!data.email || typeof data.email !== 'string' || data.email.trim() === '') return;
        ws.email = data.email;
        if (!activeUsers.find(u => u && typeof u.email === 'string' && u.email.toLowerCase() === data.email.toLowerCase())) {
          activeUsers.push({ email: data.email, lastPing: Date.now() }); notifyActiveUsers();
        }
      }
    } catch (err) {
      console.error('Errore nel parsing del messaggio WebSocket:', err);
    }
  });

  ws.on('close', () => {
    if (ws.email) {
      activeUsers = activeUsers.filter(u => u.email.toLowerCase() !== ws.email.toLowerCase());
      notifyActiveUsers();
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// Avvio
// ───────────────────────────────────────────────────────────────────────────────
checkAllReportFiles();

app.get('/api/loggedUsers', (req, res) => { res.json(activeUsers); });

server.listen(3001, '0.0.0.0', () => {
  console.log('🚀 Server in ascolto su http://192.168.1.250:3001');
});
startMultiPrinterScheduler();
