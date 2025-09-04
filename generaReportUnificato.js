// File: generaReportUnificato.js

const fs = require('fs');
const path = require('path');


const DATA_DIR           = path.join(__dirname, 'data');
const SETTINGS_PATH      = path.join(DATA_DIR, 'stampantiSettings.json');
const MONITOR_MAX_GAP_MS = 10_000;

const HEADERS_MAP = [
  ['documentid',            'ID Documento'],
  ['jobid',                 'ID Lavoro'],
  ['jobtype',               'Tipo Lavoro'],
  ['jobname',               'Nome Lavoro'],
  ['printmode',             'Modalità di Stampa'],
  ['startdate',             'Data Inizio'],
  ['starttime',             'Ora Inizio'],
  ['activetime',            'Tempo Attivo'],
  ['idletime',              'Tempo Inattivo'],
  ['readydate',             'Data Fine'],
  ['readytime',             'Ora Fine'],
  ['accountid',             'Account ID'],
  ['noffinishedsets',       'Set Completati'],
  ['result',                'Risultato'],
  ['receptiondate',         'Data Ricezione'],
  ['receptiontime',         'Ora Ricezione'],
  ['operatornote',          'Nota Operatore'],
  ['copiesrequested',       'Copie Richieste'],
  ['mediatypeid',           'ID Tipo Media'],
  ['mediatype',             'Tipo Media'],
  ['mediawidth',            'Larghezza Media (mm)'],
  ['medialengthused',       'Lunghezza Media Usata (mm)'],
  ['printedarea',           'Area Stampata (mm²)'],
  ['inkcolorcyan',          'Inchiostro Ciano'],
  ['inkcolormagenta',       'Inchiostro Magenta'],
  ['inkcoloryellow',        'Inchiostro Giallo'],
  ['inkcolorblack',         'Inchiostro Nero'],
  ['inkcolorwhite',         'Inchiostro Bianco'],
  ['inkcolorvarnish',       'Vernice'],
  ['inkcolorlightcyan',     'Inchiostro Ciano Chiaro'],
  ['inkcolorlightmagenta',  'Inchiostro Magenta Chiaro'],
  ['batchid',               'ID Batch'],
  ['batchtype',             'Tipo Batch'],
  ['imagewidth',            'Larghezza Immagine (mm)'],
  ['imageheight',           'Altezza Immagine (mm)'],
  ['printsrequested',       'Stampe Richieste'],
  ['printsdone',            'Stampe Eseguite'],
  ['rigidwidth',            'Larghezza Rigido (mm)'],
  ['rigidheight',           'Altezza Rigido (mm)'],
  ['rigidsused',            'Rigidi Usati'],
  ['consumo_kwh',           'Consumo kWh'],
];

function toMillis(dateStr, timeStr = '00:00:00') {
  if (!dateStr) return NaN;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(`${dateStr}T${timeStr}`).getTime();
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    const [d, m, y] = dateStr.split('/');
    const [hh, mm, ss] = timeStr.split(':');
    return new Date(y, m - 1, d, hh, mm, ss).getTime();
  }
  return NaN;
}

function buildConsumoCalculator(monitorPath) {
  let monitorData = [];
  try {
    if (monitorPath && fs.existsSync(monitorPath)) {
      const raw = fs.readFileSync(monitorPath, 'utf8').trim();
      monitorData = raw ? JSON.parse(raw) : [];
      monitorData.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }
  } catch (err) {
    console.error('Errore lettura monitor JSON:', err);
  }

  const findClosestKwh = (timestamp) => {
    let closest = null;
    let minDiff = Infinity;
    for (const record of monitorData) {
      const diff = Math.abs(new Date(record.timestamp) - timestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closest = record.today_kwh;
      }
    }
    return closest;
  };

  return function consumoKwh(row) {
    const disp = (row.dispositivo || '').trim().toUpperCase();
    if (!disp.includes('ARIZONA B') || !monitorData.length) return '';

    const tStart = toMillis(row.startdate, row.starttime);
    const tEnd = toMillis(row.readydate, row.readytime);
    if (isNaN(tStart) || isNaN(tEnd)) return '';

    const kwhStart = findClosestKwh(tStart);
    const kwhEnd = findClosestKwh(tEnd);

    if (kwhStart != null && kwhEnd != null && kwhEnd >= kwhStart) {
      return (kwhEnd - kwhStart).toFixed(2);
    }
    return '';
  };
}

async function generaReportUnificato() {
  let settings = {};
  let reportGeneraleDir = DATA_DIR;
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    if (settings.reportGeneralePath) {
      reportGeneraleDir = settings.reportGeneralePath;
    }
  } catch {}

  const monitorPath = settings.monitorJsonPath || null;
  const calcKwh = buildConsumoCalculator(monitorPath);

  const files = fs.readdirSync(DATA_DIR)
    .filter(f => /^Reportgenerali_.*\.json$/.test(f));

  const allRows = [];
  for (const fname of files) {
  const dispositivo = fname.replace(/^Reportgenerali_(.*)\.json$/, '$1');
  let rows = [];
  let changed = false; // Serve a sapere se almeno un valore cambia
  try {
    rows = JSON.parse(fs.readFileSync(path.join(DATA_DIR, fname), 'utf8'));
  } catch (err) {
    console.error(`Errore parsing ${fname}:`, err);
    continue;
  }
  rows.forEach(r => {
    r.dispositivo = dispositivo;
    if (dispositivo.trim().toUpperCase() === "ARIZONA B") {
  const kwhTotaleJob = calcKwh(r);
  const copie = Number(r.noffinishedsets || r.printsdone || 0);
  const kwhSingola = (copie > 0 && kwhTotaleJob !== "") ?
                     Number((kwhTotaleJob / copie).toFixed(3)) : kwhTotaleJob;

  if (r.consumo_kwh !== kwhSingola) {
    r.consumo_kwh = kwhSingola;   // -> ora è per copia
    changed = true;
  }
}

    allRows.push(r);
  });
  // Risalva solo se almeno un valore cambiato
  if (changed) {
    fs.writeFileSync(path.join(DATA_DIR, fname), JSON.stringify(rows, null, 2));
  }
}


  if (!fs.existsSync(reportGeneraleDir)) {
    fs.mkdirSync(reportGeneraleDir, { recursive: true });
  }

  
}

module.exports = { generaReportUnificato };
