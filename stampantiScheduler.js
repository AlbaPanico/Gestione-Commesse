const fs = require('fs');
const path = require('path');

// Ricerca binaria per trovare l'indice del timestamp più vicino
function binarySearchClosest(arr, value) {

  let low = 0, high = arr.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (arr[mid] === value) return mid;
    if (arr[mid] < value) low = mid + 1;
    else high = mid - 1;
  }
  // low è il punto di inserimento
  if (low === 0) return 0;
  if (low >= arr.length) return arr.length - 1;
  const prev = low - 1;
  return Math.abs(arr[prev] - value) <= Math.abs(arr[low] - value) ? prev : low;
}

function loadAndParseStampanti(initial = false) {
  // 1) Leggi impostazioni
  const settingsPath = path.join(__dirname, 'data', 'stampantiSettings.json');
  if (!fs.existsSync(settingsPath)) return;
  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (err) {
    console.error('Errore parsing impostazioni:', err);
    return;
  }
  const { path: folder, monitorJsonPath } = settings;

  // 2) Leggi ultimo CSV
  let csvFiles;
  try {
    csvFiles = fs.readdirSync(folder).filter(f => f.toLowerCase().endsWith('.csv'));
  } catch (err) {
    console.error('Errore lettura cartella CSV:', err);
    return;
  }
  if (!csvFiles.length) return;

  const latestCsv = csvFiles
    .map(name => {
      const stats = fs.statSync(path.join(folder, name));
      return { name, mtime: stats.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime)[0].name;

  let csvContent;
  try {
    csvContent = fs.readFileSync(path.join(folder, latestCsv), 'utf8').trim();
  } catch (err) {
    console.error('Errore lettura file CSV:', err);
    return;
  }

  const [hdrLine, ...lines] = csvContent.split(/\r?\n/);
  const headers = hdrLine.split(';').map(h => h.replace(/^"|"$/g, '').trim());
  const rows = lines.map(l => l.split(';').map(f => f.replace(/^"|"$/g, '').trim()));

  // 3) Carica dati di monitoraggio
  let monitorData = [];
  if (fs.existsSync(monitorJsonPath)) {
    try {
      const raw = fs.readFileSync(monitorJsonPath, 'utf8').trim();
      monitorData = raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.error('Errore lettura dati monitoraggio:', err);
      monitorData = [];
    }
  }
  if (!monitorData.length) {
    console.warn('Nessun dato di monitoraggio trovato.');
    return;
  }

  // Ordina e precomputa array per binary search
  monitorData.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const timestamps = monitorData.map(m => new Date(m.timestamp).getTime());
  const kwhs = monitorData.map(m => m.today_kwh);

  // Indici colonne
  const iD = headers.indexOf('Device');
  const iS = headers.indexOf('Start');
  const iE = headers.indexOf('End');
  if (iD < 0 || iS < 0 || iE < 0) {
    console.error('Header richiesti mancanti');
    return;
  }

  // 4) Raggruppa e calcola consumo
  const parsed = [];
  let prevKey = null;
  for (const row of rows) {
    const key = `${row[iD]}|${row[iS]}|${row[iE]}`;
    if (key !== prevKey) {
      const device = row[iD];
      const start = row[iS];
      const end = row[iE];
      const tStart = new Date(start).getTime();
      const tEnd = new Date(end).getTime();
      const idx1 = binarySearchClosest(timestamps, tStart);
      const idx2 = binarySearchClosest(timestamps, tEnd);
      const k1 = kwhs[idx1];
      const k2 = kwhs[idx2];
      const consumoKwh = (!isNaN(k2 - k1) && k2 >= k1) ? Number((k2 - k1).toFixed(2)) : null;
      parsed.push({ device, start, end, consumoKwh });
      prevKey = key;
    }
  }

  // 5) Filtra solo le stampanti "Arizona New"
  const filtered = parsed.filter(item =>
    item.device && item.device.toLowerCase().includes('arizona new')
  );

  // 6) Scrivi su file
  const outPath = path.join(__dirname, 'data', 'stampanti_parsed.json');
  try {
    fs.writeFileSync(outPath, JSON.stringify(filtered, null, 2));
    if (initial) console.log('✅ Prima esecuzione stampantiScheduler completata.');
  } catch (err) {
    console.error('Errore scrittura JSON output:', err);
  }
}

module.exports = { loadAndParseStampanti };
