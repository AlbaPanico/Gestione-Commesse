// File: server.js

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const cors    = require('cors');
const http    = require('http');
const WebSocket = require('ws');
const cron = require('node-cron');
const { startMultiPrinterScheduler } = require('./stampantiMultiScheduler');
const app = express();


const { spawn } = require('child_process');

// Path assoluto a Python e FinestraMateriali.py
const PYTHON_PATH = 'python'; // O 'python3' se hai problemi
const MATERIALI_SCRIPT = 'C:\\Users\\Applicazioni\\Gestione Commesse\\FinestraMateriali.py';

console.log('Avvio automatico del backend materiali Flask...');
const materialiProc = spawn(PYTHON_PATH, [MATERIALI_SCRIPT], {
  detached: true, // così va avanti anche se Node "non attende"
  stdio: 'ignore' // non ti intasa la console Node di messaggi
});
materialiProc.unref(); // Slega dal parent

// Se vuoi vedere i log, togli stdio: 'ignore' e usa stdio: 'inherit'


// 🔰 Bootstrap sicuro: proteggiamo **sia** il require **sia** la prima esecuzione




app.use(cors());
app.use(express.json({ limit: '50mb' }));

//app.post('/api/genera-commessa', ...);
//app.get('/api/loggedUsers', ...);


// Variabile globale per tenere traccia degli utenti attivi
let activeUsers = [];

// Funzione per notificare a tutti i client l'elenco degli utenti attivi
const notifyActiveUsers = () => {
  const message = JSON.stringify({ type: 'activeUsers', data: activeUsers });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};

/* ----------------------- COSTANTI PER IL FILE DI IMPOSTAZIONI ----------------------- */
// Imposta il percorso assoluto della cartella "data" (gestione commesse\data)
// NOTA: per scrivere il backslash in una stringa UNC bisogna duplicarlo
const settingsFolderPath = '\\\\192.168.1.250\\users\\applicazioni\\gestione commesse\\data';
if (!fs.existsSync(settingsFolderPath)) {
  fs.mkdirSync(settingsFolderPath, { recursive: true });
}
const settingsFilePath = path.join(settingsFolderPath, 'impostazioni.json');

// === PROGRESSIVO BOLLE USCITA ===
const bolleUscitaPath = path.join(__dirname, 'data', 'bolle_in_uscita.json');


// Funzione che assicura che il file esista e ritorna { progressivo, ultimaData }
function getBolleUscita() {
  if (!fs.existsSync(bolleUscitaPath)) {
    const initial = { progressivo: 1 };
    fs.writeFileSync(bolleUscitaPath, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(bolleUscitaPath, "utf8"));
  } catch {
    const initial = { progressivo: 1 };
    fs.writeFileSync(bolleUscitaPath, JSON.stringify(initial, null, 2));
    return initial;
  }
}

function saveBolleUscita(prog) {
  const record = { progressivo: prog };
  fs.writeFileSync(bolleUscitaPath, JSON.stringify(record, null, 2));
  console.log("🚚 SALVATO bolle_in_uscita.json in:", bolleUscitaPath, record);
}


// === PROGRESSIVO BOLLE ENTRATA ===
const bolleEntrataPath = path.join(__dirname, 'data', 'bolle_in_entrata.json');

function getBolleEntrata() {
  if (!fs.existsSync(bolleEntrataPath)) {
    const initial = { progressivo: 1 };
    fs.writeFileSync(bolleEntrataPath, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(bolleEntrataPath, "utf8"));
  } catch {
    const initial = { progressivo: 1 };
    fs.writeFileSync(bolleEntrataPath, JSON.stringify(initial, null, 2));
    return initial;
  }
}

function saveBolleEntrata(prog) {
  const record = { progressivo: prog };
  fs.writeFileSync(bolleEntrataPath, JSON.stringify(record, null, 2));
  console.log("🚚 SALVATO bolle_in_entrata.json in:", bolleEntrataPath, record);
}




/* ----------------------- FUNZIONI PER GESTIRE GLI UTENTI ----------------------- */
const usersFilePath = path.join(__dirname, 'data', 'users.json');

const readUsers = () => {
  if (fs.existsSync(usersFilePath)) {
    const data = fs.readFileSync(usersFilePath, 'utf8');
    return data ? JSON.parse(data) : [];
  }
  return [];
};

const saveUsers = (users) => {
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
};

/* ----------------------- ENDPOINTS UTENTI ----------------------- */
app.post('/api/register', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email e password sono obbligatorie.' });
  }
  const users = readUsers();
  const existingUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existingUser) {
    return res.status(400).json({ error: 'Email già registrata.' });
  }
  const newUser = { email, password };
  users.push(newUser);
  saveUsers(users);
  console.log(`Nuovo utente registrato: ${email}`);
  res.json({ message: 'Registrazione completata!', user: newUser });
});

// === ENDPOINT PER APRIRE UNA CARTELLA LOCALE VIA AppTimePass ===
app.post('/api/open-folder-local', (req, res) => {
  const { folderPath } = req.body;
  if (!folderPath) return res.status(400).json({ message: 'Percorso mancante' });

  // Path fisso 
  const cmdFile = "C:\\Users\\Applicazioni\\Gestione Commesse\\data\\apptimepass_cmd.json";
  const cmd = { action: "open_folder", folder: folderPath };

  // Log per debug (puoi togliere dopo il test)
  console.log("Scrivo comando qui:", cmdFile);

  try {
    fs.writeFileSync(cmdFile, JSON.stringify(cmd, null, 2));
    return res.json({ message: 'Comando scritto, la cartella si aprirà a breve!' });
  } catch (err) {
    return res.status(500).json({ message: 'Errore scrivendo il file comando.', error: err.toString() });
  }
});




app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email e password sono obbligatorie.' });
  }
  const users = readUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
  if (!user) {
    return res.status(401).json({ error: 'Credenziali non valide.' });
  }
  console.log(`Utente loggato: ${email}`);
  res.json({ message: 'Login effettuato con successo!', user });
if (!activeUsers.find(u => u.email.toLowerCase() === email.toLowerCase())) {
  activeUsers.push({ email, lastPing: Date.now() });
  notifyActiveUsers();
}

});

app.post('/api/save-pdf-report', (req, res) => {
  const { folderPath, pdfData, fileName } = req.body;
  if (!folderPath || !pdfData) {
    return res.status(400).json({ message: "I parametri 'folderPath' e 'pdfData' sono obbligatori." });
  }

  // Crea la cartella se non esiste!
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  // Usa il fileName passato dal frontend, oppure "report.pdf" di default
  const pdfPath = path.join(folderPath, fileName || 'report.pdf');

  const base64Prefix = 'base64,';
  const base64Index = pdfData.indexOf(base64Prefix);
  if (base64Index === -1) {
    return res.status(400).json({ message: "Formato di pdfData non valido." });
  }

  const base64Data = pdfData.substring(base64Index + base64Prefix.length);
  const pdfBuffer = Buffer.from(base64Data, 'base64');

  fs.writeFile(pdfPath, pdfBuffer, (err) => {
    if (err) {
      console.error("Errore nel salvataggio del PDF:", err);
      return res.status(500).json({ message: "Errore nel salvataggio del PDF", error: err.toString() });
    }
    console.log("PDF salvato in", pdfPath);
    // Rispondi "ok" ma NON serve fare il download qui
    res.json({ message: "PDF salvato con successo!", path: pdfPath });
  });
});



// Endpoint per salvare un file Excel nella cartella MATERIALI
app.post('/api/save-excel-report', (req, res) => {
  const { folderPath, excelData, fileName } = req.body;
  if (!folderPath || !excelData) {
    return res.status(400).json({ message: "I parametri 'folderPath' e 'excelData' sono obbligatori." });
  }

  // Crea la cartella se non esiste!
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  // Usa il fileName passato dal frontend, oppure "distinta_materiali.xlsx" di default
  const excelPath = path.join(folderPath, fileName || 'distinta_materiali.xlsx');

  // excelData è una stringa tipo "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,xxxx"
  const base64Prefix = 'base64,';
  const base64Index = excelData.indexOf(base64Prefix);
  if (base64Index === -1) {
    return res.status(400).json({ message: "Formato di excelData non valido." });
  }
  const base64Content = excelData.substring(base64Index + base64Prefix.length);
  const excelBuffer = Buffer.from(base64Content, 'base64');

  fs.writeFile(excelPath, excelBuffer, (err) => {
    if (err) {
      console.error("Errore nel salvataggio dell'Excel:", err);
      return res.status(500).json({ message: "Errore nel salvataggio dell'Excel", error: err.toString() });
    }
    console.log("Excel salvato in", excelPath);
    res.json({ message: "Excel salvato con successo!", path: excelPath });
  });
});


// --- ENDPOINT: Restituisce la lista dei file in una cartella (ad es: per verificare la presenza bolla uscita) ---
app.post('/api/lista-file', (req, res) => {
  const { folderPath } = req.body;
  if (!folderPath) {
    return res.status(400).json({ error: "folderPath mancante" });
  }
  // Leggi solo i file, escludi le sottocartelle
  fs.readdir(folderPath, { withFileTypes: true }, (err, files) => {
    if (err) return res.status(500).json({ error: err.message });
    // Restituisci SOLO il nome dei file (non le cartelle)
    const onlyFiles = files.filter(f => f.isFile()).map(f => f.name);
    res.json(onlyFiles);
  });
});






app.post('/api/logout', (req, res) => {
  const { email } = req.body;
  console.log("Logout richiesto per:", email);
  activeUsers = activeUsers.filter(u => u.email.toLowerCase() !== email.toLowerCase());
  console.log("Utenti attivi dopo logout:", activeUsers);
  notifyActiveUsers();
  res.json({ message: 'Logout effettuato con successo!' });
});

// Endpoint per il ping (heartbeat)
app.post('/api/ping', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: "Email mancante" });
  }
  // Cerca l'utente nell'array activeUsers
  const user = activeUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (user) {
    // Aggiorna il timestamp dell'ultimo ping
    user.lastPing = Date.now();
  } else {
    // Se non esiste, aggiungilo con il timestamp corrente
    activeUsers.push({ email, lastPing: Date.now() });
  }
  console.log(`Ping ricevuto per: ${email}`);
  // Aggiorna i client (se necessario) inviando l'elenco aggiornato degli utenti attivi
  notifyActiveUsers();
  res.json({ message: "Ping ricevuto" });
});


/* QUI METTI IL NUOVO ENDPOINT! */
// Endpoint SOLO LETTURA per mostrare il prossimo numero, senza avanzare il progressivo
app.get('/api/prossima-bolla', (req, res) => {
  let bolle = getBolleUscita();
  res.json({
    numeroBolla: String(bolle.progressivo).padStart(4, "0")
  });
});

app.post('/api/avanza-bolla', (req, res) => {
  let bolle = getBolleUscita();
  const progressivo = bolle.progressivo;
  saveBolleUscita(progressivo + 1);
  res.json({
    numeroBolla: String(progressivo).padStart(4, "0")
  });
});

// === BOLLA ENTRATA: progressivo unico nel file bolle_in_entrata.json ===
const BOLLE_ENTRATA_PATH = path.join(__dirname, "data", "bolle_in_entrata.json");

// Inizializza il file se non esiste
function assicuratiBollaEntrata() {
  if (!fs.existsSync(BOLLE_ENTRATA_PATH)) {
    fs.writeFileSync(BOLLE_ENTRATA_PATH, JSON.stringify({ progressivo: 1 }, null, 2));
  }
}

// Ritorna il prossimo progressivo ma NON avanza (per mostrare nella UI)
app.post("/api/prossima-bolla-entrata", (req, res) => {
  assicuratiBollaEntrata();
  const dati = JSON.parse(fs.readFileSync(BOLLE_ENTRATA_PATH, "utf8"));
  const numeroBolla = String(dati.progressivo).padStart(4, "0");
  res.json({ numeroBolla });
});

// Avanza il progressivo e restituisce il nuovo valore (usato quando si genera la bolla)
app.post("/api/avanza-bolla-entrata", (req, res) => {
  assicuratiBollaEntrata();
  let dati = JSON.parse(fs.readFileSync(BOLLE_ENTRATA_PATH, "utf8"));
  dati.progressivo = (dati.progressivo || 1) + 1;
  fs.writeFileSync(BOLLE_ENTRATA_PATH, JSON.stringify(dati, null, 2));
  const numeroBolla = String(dati.progressivo - 1).padStart(4, "0");
  res.json({ numeroBolla });
});


// Endpoint SOLO LETTURA per mostrare il prossimo numero bolla ENTRATA (con "T")
app.get('/api/prossima-bolla-entrata', (req, res) => {
  let bolle = getBolleEntrata();
  res.json({
    numeroBolla: "T" + String(bolle.progressivo).padStart(4, "0")
  });
});

// Endpoint che AVANZA il progressivo solo quando viene effettivamente generata la bolla ENTRATA
app.post('/api/avanza-bolla-entrata', (req, res) => {
  let bolle = getBolleEntrata();
  const progressivo = bolle.progressivo;
  saveBolleEntrata(progressivo + 1);
  res.json({
    numeroBolla: "T" + String(progressivo).padStart(4, "0")
  });
});



// Endpoint che AVANZA il progressivo solo quando viene effettivamente generata la bolla
app.post('/api/avanza-bolla', (req, res) => {
  let bolle = getBolleUscita();
  const oggi = new Date().toISOString().split("T")[0];
  if (bolle.ultimaData !== oggi) {
    bolle.progressivo = 1;
    bolle.ultimaData = oggi;
  }
  const progressivo = bolle.progressivo;
  saveBolleUscita(progressivo + 1, oggi);

  // Log come prima
  const logLine = `[${new Date().toISOString()}] BOLLA generata - Numero: ${String(progressivo).padStart(4, "0")}, Data: ${oggi}\n`;
  fs.appendFileSync(path.join(__dirname, "data", "bolle.log"), logLine);

  res.json({
    numeroBolla: String(progressivo).padStart(4, "0"),
    dataTrasporto: oggi
  });
});


/* FINE NUOVO ENDPOINT */



// Controllo periodico per rimuovere gli utenti inattivi ogni 5 secondi
setInterval(() => {
  const now = Date.now();
  const timeout = 300000; // 5 minuti = 300000 millisecondi
  activeUsers = activeUsers.filter(user => {
    if (user.lastPing && (now - user.lastPing) > timeout) {
      console.log(`Rimuovo utente inattivo: ${user.email}`);
      return false;
    }
    return true;
  });
  notifyActiveUsers();
}, 5000); // Controlla ogni 5 secondi





/* ----------------------- ENDPOINTS PER GESTIONE COMMESSE ----------------------- */
app.get('/api/commesse', (req, res) => {
  const { percorsoCartella } = req.query;
  if (!percorsoCartella) {
    return res.status(400).json({ message: "Percorso cartella non specificato." });
  }
  const jsonFilePath = path.join(percorsoCartella, 'commesse.json');
  if (!fs.existsSync(jsonFilePath)) {
    fs.writeFileSync(jsonFilePath, JSON.stringify([], null, 2));
  }
  try {
    // Leggi il file JSON e parsalo
    const rawData = fs.readFileSync(jsonFilePath, 'utf8');
    let commesse = rawData.trim() ? JSON.parse(rawData) : [];

    // Deduplica l'array corrente usando una Map (chiave: brand_nomeProdotto_codiceProgetto_codiceCommessa)
    const uniqueMap = new Map();
    commesse.forEach(c => {
      const key = `${(c.brand || "").trim()}_${(c.nomeProdotto || "").trim()}_${(c.codiceProgetto || "").trim()}_${(c.codiceCommessa || "").trim()}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, c);
      } else {
        // Puoi aggiornare il flag "presente" se necessario
        const existing = uniqueMap.get(key);
        existing.presente = existing.presente || c.presente;
      }
    });
    commesse = Array.from(uniqueMap.values());

    // Leggi le directory presenti e aggiorna l'array
    const entries = fs.readdirSync(percorsoCartella, { withFileTypes: true });
    const pattern = /^([^_]+)_([^_]+)_([^_]+)_([^_]+)$/;
    const cartellePresenti = entries
      .filter(entry => entry.isDirectory() && pattern.test(entry.name))
      .map(entry => entry.name.trim());

    cartellePresenti.forEach(cartella => {
      const nomeCartella = cartella.trim();
      const match = pattern.exec(nomeCartella);
      if (match) {
        const brandVal = match[1];
        const nomeProdottoVal = match[2];
        const codiceProgettoVal = match[3];
        const codiceCommessaVal = match[4];
        const uniqueKey = `${brandVal}_${nomeProdottoVal}_${codiceProgettoVal}_${codiceCommessaVal}`;
        const commessaEsistente = commesse.find(c => {
          const existingKey = `${(c.brand || "").trim()}_${(c.nomeProdotto || "").trim()}_${(c.codiceProgetto || "").trim()}_${(c.codiceCommessa || "").trim()}`;
          return existingKey === uniqueKey;
        });
        if (commessaEsistente) {
          commessaEsistente.presente = true;
        } else {
          const nuovaCommessa = {
            nome: nomeCartella,
            cliente: "",
            brand: brandVal,
            nomeProdotto: nomeProdottoVal,
            quantita: 0,
            codiceProgetto: codiceProgettoVal,
            codiceCommessa: codiceCommessaVal,
            dataConsegna: "",
            presente: true,
            percorso: path.join(percorsoCartella, nomeCartella)
          };
          commesse.push(nuovaCommessa);
        }
      }
    });

  // Esegui una deduplicazione finale (nel caso fossero state aggiunte duplicazioni)
const finalMap = new Map();
commesse.forEach(c => {
  // Forza il campo archiviata in ogni record come booleano
  c.archiviata = (c.archiviata === true || c.archiviata === "true") ? true : false;
  const key = `${(c.brand || "").trim()}_${(c.nomeProdotto || "").trim()}_${(c.codiceProgetto || "").trim()}_${(c.codiceCommessa || "").trim()}`;
  if (!finalMap.has(key)) {
    finalMap.set(key, c);
  } else {
    const existing = finalMap.get(key);
    // Se almeno uno dei record ha archiviata true, impostiamo true.
    existing.archiviata = existing.archiviata || c.archiviata;
    existing.presente = existing.presente || c.presente;
    // Se ci sono altri campi da unire, aggiungili qui...
  }
});
commesse = Array.from(finalMap.values());



    fs.writeFileSync(jsonFilePath, JSON.stringify(commesse, null, 2));
    console.log("📡 Invio commesse al frontend:", JSON.stringify(commesse, null, 2));
    res.status(200).json({ commesse });
  } catch (error) {
    console.error("❌ Errore nel recupero delle commesse:", error);
    res.status(500).json({ message: "Errore nel recupero delle commesse." });
  }
});

app.get('/api/commessa-dettagli', (req, res) => {
  const { percorsoCartella, commessaNome } = req.query;
  console.log(`📥 Parametri ricevuti: percorsoCartella=${percorsoCartella}, commessaNome=${commessaNome}`);
  if (!percorsoCartella || !commessaNome) {
    console.log("❌ Parametri mancanti!");
    return res.status(400).json({ message: "Parametri mancanti." });
  }
  const jsonFilePath = path.join(percorsoCartella, 'commesse.json');
  console.log(`📂 Cerco il file JSON in: ${jsonFilePath}`);
  if (!fs.existsSync(jsonFilePath)) {
    console.log("❌ File JSON non trovato.");
    return res.status(404).json({ message: "File JSON non trovato." });
  }
  try {
    const rawData = fs.readFileSync(jsonFilePath, 'utf8');
    console.log(`📄 Contenuto JSON letto: ${rawData}`);
    const commesse = rawData.trim() ? JSON.parse(rawData) : [];
    console.log(`🔍 Commesse trovate nel file:`, commesse);
    const commessa = commesse.find(c => 
      `${c.brand}_${c.nomeProdotto}_${c.codiceProgetto}_${c.codiceCommessa}` === commessaNome
    );
    if (!commessa) {
      console.log(`❌ Commessa ${commessaNome} non trovata.`);
      return res.status(404).json({ message: "Commessa non trovata." });
    }
    console.log("✅ Commessa trovata e inviata:", commessa);
    res.status(200).json(commessa);
  } catch (error) {
    console.error("❌ Errore nel recupero dei dettagli della commessa:", error);
    res.status(500).json({ message: "Errore nel recupero dei dettagli della commessa." });
  }
});

/* ----------------------- FUNZIONE DI COPIA ----------------------- */
const copyDirectory = (source, destination) => {
  try {
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }
    const entries = fs.readdirSync(source, { withFileTypes: true });
    for (let entry of entries) {
      const srcPath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);
      if (entry.isDirectory()) {
        copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
    console.log(`✅ Clonazione completata: ${destination}`);
  } catch (error) {
    console.error(`❌ Errore nella clonazione della cartella ${source}:`, error);
  }
};

/* ----------------------- ENDPOINT PER GENERARE COMMESSA ----------------------- */
app.post('/api/genera-commessa', (req, res) => {
  const {
    cliente,
    brand,
    nomeProdotto,
    quantita,
    codiceProgetto,
    codiceCommessa,
    dataConsegna,
    percorsoCartella,
    cartellaDaClonare,
    selectedCalendarData // dati da SelectedCalendar
  } = req.body;

  console.log("Data Consegna ricevuta dal client:", dataConsegna);

  if (
    !cliente ||
    !brand ||
    !nomeProdotto ||
    !codiceProgetto ||
    !codiceCommessa ||
    !percorsoCartella ||
    !cartellaDaClonare
  ) {
    return res.status(400).json({ message: 'Tutti i campi obbligatori non sono stati compilati.' });
  }

  const quantitaFinale = quantita || 0;
  const dataConsegnaFinale = dataConsegna || "";
  const folderName = `${brand}_${nomeProdotto}_${codiceProgetto}_${codiceCommessa}`;
  const folderPath = path.join(percorsoCartella, folderName);

  try {
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
      console.log(`✅ Cartella creata: ${folderPath}`);
      copyDirectory(cartellaDaClonare, folderPath);
    }
  } catch (error) {
    console.error('❌ Errore nella creazione/clonazione della cartella:', error);
    return res.status(500).json({ message: "Errore nella creazione/clonazione della cartella." });
  }

  const jsonFilePath = path.join(percorsoCartella, 'commesse.json');
  let commesseData = [];
  if (fs.existsSync(jsonFilePath)) {
    try {
      const rawData = fs.readFileSync(jsonFilePath, 'utf8');
      if (rawData.trim()) {
        commesseData = JSON.parse(rawData);
      }
    } catch (error) {
      console.error('❌ Errore nella lettura del file JSON:', error);
    }
  }

  const nuovaCommessa = {
    nome: folderName,
    cliente,
    brand,
    nomeProdotto,
    quantita: quantitaFinale,
    codiceProgetto,
    codiceCommessa,
    dataConsegna: dataConsegnaFinale,
    percorso: folderPath
  };

  commesseData.push(nuovaCommessa);

  try {
    fs.writeFileSync(jsonFilePath, JSON.stringify(commesseData, null, 2));
    console.log("✅ File JSON aggiornato con successo:", jsonFilePath);
  } catch (error) {
    console.error("❌ Errore nella scrittura del file JSON:", error);
    return res.status(500).json({
      message: "Errore nel salvataggio della commessa.",
      error: error.toString()
    });
  }

  // Creazione (o aggiornamento) del file report.json nella cartella della commessa
  const report = {
    cliente,
    brand,
    nomeProdotto,
    quantita: quantitaFinale,
    codiceProgetto,
    codiceCommessa,
    dataConsegna: dataConsegnaFinale,
    selectedCalendarData // dati da SelectedCalendar
  };

  const reportPath = path.join(folderPath, 'report.json');
  try {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log("✅ report.json generato in", reportPath);
  } catch (error) {
    console.error("❌ Errore nella scrittura di report.json:", error);
  }

  res.status(200).json({
    message: `Cartella ${folderName} creata con file JSON e report.json aggiornato!`,
    folderPath
  });
});

/* ----------------------- ENDPOINT PER MODIFICARE COMMESSA ----------------------- */
app.post('/api/modifica-commessa', (req, res) => {
  const { cartellaDaClonare, nomeOriginale, nuovaCommessa, percorsoCartella } = req.body;
  if (!cartellaDaClonare || !nomeOriginale || !nuovaCommessa || !percorsoCartella) {
    return res.status(400).json({ message: "Dati mancanti per la modifica." });
  }
  const jsonFilePath = path.join(percorsoCartella, 'commesse.json');
  if (!fs.existsSync(jsonFilePath)) {
    return res.status(404).json({ message: "File commesse non trovato." });
  }
  try {
    let commesse = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
    const index = commesse.findIndex(c => 
      `${c.brand}_${c.nomeProdotto}_${c.codiceProgetto}_${c.codiceCommessa}` === nomeOriginale
    );
    if (index === -1) {
      return res.status(404).json({ message: "Commessa non trovata." });
    }
    const oldFolderPath = commesse[index].percorso;
    const newFolderName = `${nuovaCommessa.brand}_${nuovaCommessa.nomeProdotto}_${nuovaCommessa.codiceProgetto}_${nuovaCommessa.codiceCommessa}`;
    const newFolderPath = path.join(path.dirname(oldFolderPath), newFolderName);
    
    // Se la cartella esiste, rinominala
    if (fs.existsSync(oldFolderPath)) {
      fs.renameSync(oldFolderPath, newFolderPath);
    }
    
    // --- INIZIO BLOCCO AGGIORNAMENTO report.json ---
    const reportFileOld = path.join(oldFolderPath, 'report.json');
    const reportFileNew = path.join(newFolderPath, 'report.json');

    let reportData = {};
    if (fs.existsSync(reportFileOld)) {
      try {
        const rawReport = fs.readFileSync(reportFileOld, 'utf8');
        reportData = JSON.parse(rawReport);
      } catch (err) {
        console.error('Errore leggendo report.json vecchio:', err);
      }
    }

    reportData.cliente = nuovaCommessa.cliente || reportData.cliente || "";
    reportData.brand = nuovaCommessa.brand || reportData.brand || "";
    reportData.nomeProdotto = nuovaCommessa.nomeProdotto || reportData.nomeProdotto || "";
    reportData.quantita = nuovaCommessa.quantita || reportData.quantita || 0;
    reportData.codiceProgetto = nuovaCommessa.codiceProgetto || reportData.codiceProgetto || "";
    reportData.codiceCommessa = nuovaCommessa.codiceCommessa || reportData.codiceCommessa || "";
    reportData.dataConsegna = nuovaCommessa.dataConsegna || reportData.dataConsegna || "";

    if (oldFolderPath !== newFolderPath && fs.existsSync(reportFileOld)) {
      fs.unlinkSync(reportFileOld);
    }

    try {
      fs.writeFileSync(reportFileNew, JSON.stringify(reportData, null, 2));
      console.log('✅ report.json aggiornato in modifica-commessa:', reportFileNew);
    } catch (err) {
      console.error('❌ Errore scrivendo report.json in modifica-commessa:', err);
    }
    // --- FINE BLOCCO AGGIORNAMENTO report.json ---

    commesse[index] = { ...commesse[index], ...nuovaCommessa, percorso: newFolderPath };
    
    try {
      fs.writeFileSync(jsonFilePath, JSON.stringify(commesse, null, 2));
      console.log("✅ File JSON aggiornato con successo:", jsonFilePath);
    } catch (error) {
      console.error("❌ Errore nella scrittura del file JSON:", error);
      return res.status(500).json({ message: "Errore nel salvataggio della commessa.", error: error.toString() });
    }
    
    res.status(200).json({ message: "Commessa aggiornata con successo.", commessa: commesse[index] });
    setTimeout(() => notifyClients(), 1000);
    setTimeout(() => notifyClients(), 500);
  } catch (error) {
    console.error("Errore aggiornamento commessa:", error);
    res.status(500).json({ message: "Errore nel salvataggio della commessa.", error: error.toString() });
  }
});

/* ----------------------- ENDPOINT PER RINOMINARE CARTELLA ----------------------- */
app.post('/api/rinomina-cartella', (req, res) => {
  const { cartellaDaClonare, nomeVecchio, nomeNuovo } = req.body;
  if (!cartellaDaClonare || !nomeVecchio || !nomeNuovo) {
    return res.status(400).json({ message: "Dati mancanti per la rinomina." });
  }
  const vecchioPercorso = path.join(cartellaDaClonare, nomeVecchio);
  const nuovoPercorso = path.join(cartellaDaClonare, nomeNuovo);
  if (!fs.existsSync(vecchioPercorso)) {
    return res.status(404).json({ message: "Cartella originale non trovata." });
  }
  try {
    fs.renameSync(vecchioPercorso, nuovoPercorso);
    console.log(`📂 Cartella rinominata: ${vecchioPercorso} ➡️ ${nuovoPercorso}`);
    res.status(200).json({ message: "Cartella rinominata con successo." });
  } catch (error) {
    console.error("❌ Errore nella rinomina della cartella:", error);
    res.status(500).json({ message: "Errore nella rinomina della cartella." });
  }
});

/* ----------------------- ENDPOINT PER CANCELLARE COMMESSA ----------------------- */
app.delete('/api/cancella-commessa/:percorsoCartella/:commessaNome', (req, res) => {
  const { percorsoCartella, commessaNome } = req.params;
  console.log(`DELETE /api/cancella-commessa chiamato con: percorsoCartella=${percorsoCartella}, commessaNome=${commessaNome}`);
  if (!percorsoCartella || !commessaNome) {
    console.log("❌ Parametri mancanti per la cancellazione.");
    return res.status(400).json({ message: "Parametri mancanti per la cancellazione." });
  }
  const jsonFilePath = path.join(percorsoCartella, 'commesse.json');
  if (!fs.existsSync(jsonFilePath)) {
    return res.status(404).json({ message: "File JSON delle commesse non trovato." });
  }
  let commesse;
  try {
    const rawData = fs.readFileSync(jsonFilePath, 'utf8');
    commesse = rawData.trim() ? JSON.parse(rawData) : [];
  } catch (error) {
    console.error("❌ Errore nella lettura del file JSON:", error);
    return res.status(500).json({ message: "Errore nella lettura del file JSON." });
  }
  const index = commesse.findIndex(c => c.nome === commessaNome);
  if (index === -1) {
    return res.status(404).json({ message: "Commessa non trovata." });
  }
  const folderPath = commesse[index].percorso;
  console.log("Percorso salvato nel JSON:", folderPath);
  try {
    fs.rmSync(folderPath, { recursive: true, force: true });
    console.log(`✅ Cartella cancellata: ${folderPath}`);
  } catch (error) {
    console.error("❌ Errore cancellando la cartella:", error);
    return res.status(500).json({ message: "Errore cancellando la cartella.", error: error.toString() });
  }
  commesse.splice(index, 1);
  try {
    fs.writeFileSync(jsonFilePath, JSON.stringify(commesse, null, 2));
    console.log("✅ File JSON aggiornato dopo cancellazione:", jsonFilePath);
  } catch (error) {
    console.error("❌ Errore aggiornando il file JSON dopo cancellazione:", error);
    return res.status(500).json({ message: "Errore aggiornando il file JSON.", error: error.toString() });
  }
  return res.status(200).json({ message: "Commessa cancellata con successo." });
});

/* ----------------------- ENDPOINT PER GESTIRE REPORT.JSON ----------------------- */
// GET per ottenere (e, se necessario, creare) il file report.json
app.get('/api/report', (req, res) => {
  const { folderPath } = req.query;
  if (!folderPath) {
    return res.status(400).json({ message: 'Il parametro folderPath è obbligatorio.' });
  }
  const reportFilePath = path.join(folderPath, 'report.json');
  if (!fs.existsSync(reportFilePath)) {
    const defaultReport = {}; // Oggetto di default
    try {
      fs.writeFileSync(reportFilePath, JSON.stringify(defaultReport, null, 2));
      console.log(`✅ report.json creato in: ${reportFilePath}`);
    } catch (error) {
      console.error("❌ Errore nella creazione di report.json:", error);
      return res.status(500).json({ message: "Errore nella creazione del file report.json.", error: error.toString() });
    }
    return res.status(200).json({ report: defaultReport });
  }
  try {
    const rawData = fs.readFileSync(reportFilePath, 'utf8');
    const reportData = rawData.trim() ? JSON.parse(rawData) : {};
    return res.status(200).json({ report: reportData });
  } catch (error) {
    console.error("❌ Errore nella lettura di report.json:", error);
    return res.status(500).json({ message: "Errore nella lettura del file report.json.", error: error.toString() });
  }
});

// POST per aggiornare report.json
app.post('/api/report', (req, res) => {
  const { folderPath, reportData } = req.body;
  console.log("ReportData ricevuto:", reportData);  // Per debug
  if (!folderPath || !reportData) {
    return res.status(400).json({ message: 'I parametri folderPath e reportData sono obbligatori.' });
  }
  const reportFilePath = path.join(folderPath, 'report.json');
  try {
    // Se il file report.json esiste, leggi il contenuto esistente
    let existingReport = {};
    if (fs.existsSync(reportFilePath)) {
      const rawExisting = fs.readFileSync(reportFilePath, 'utf8');
      existingReport = rawExisting.trim() ? JSON.parse(rawExisting) : {};
    }
    // Unisci (merge) il report esistente con i nuovi dati
    const mergedReport = { ...existingReport, ...reportData };
    console.log(`Merged report:`, mergedReport);
    fs.writeFileSync(reportFilePath, JSON.stringify(mergedReport, null, 2));
    console.log(`✅ report.json aggiornato in: ${reportFilePath}`, mergedReport);
    const parentFolder = path.dirname(folderPath);
    refreshCommesseJSON(parentFolder);
    notifyClients();

    return res.status(200).json({ message: "Report aggiornato con successo." });
  } catch (error) {
    console.error("❌ Errore nell'aggiornamento di report.json:", error);
    return res.status(500).json({ message: "Errore nell'aggiornamento del file report.json.", error: error.toString() });
  }
});

/* ----------------------- LOGICA DI MONITORAGGIO ----------------------- */
let percorsoCartellaMonitorata = null;
let monitorInterval = null;

const startMonitoring = () => {
  if (monitorInterval === null && percorsoCartellaMonitorata) {
    monitorInterval = setInterval(() => {
      refreshCommesseJSON(percorsoCartellaMonitorata);
      notifyClients();
    }, 30000);
    console.log("Monitoraggio avviato.");
  }
};

const stopMonitoring = () => {
  if (monitorInterval !== null) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log("Monitoraggio fermato.");
  }
};

app.post('/api/monitor-folder', (req, res) => {
  const { percorsoCartella } = req.body;
  console.log("📂 Percorso ricevuto dal frontend:", percorsoCartella);
  if (!percorsoCartella) {
    return res.status(400).json({ message: "Percorso cartella non specificato." });
  }
  if (!fs.existsSync(percorsoCartella)) {
    console.log("❌ Cartella non trovata:", percorsoCartella);
    return res.status(404).json({ message: "Cartella non trovata." });
  }
  percorsoCartellaMonitorata = percorsoCartella;
  startMonitoring();
  monitorFile(path.join(percorsoCartella, 'commesse.json'));
  res.status(200).json({ message: "Monitoraggio avviato con successo." });
});

const refreshCommesseJSON = (percorsoCartella) => {
  const jsonFilePath = path.join(percorsoCartella, 'commesse.json');
  let jsonData = [];
  if (fs.existsSync(jsonFilePath)) {
    try {
      const rawData = fs.readFileSync(jsonFilePath, 'utf8');
      jsonData = rawData.trim() ? JSON.parse(rawData) : [];
    } catch (error) {
      console.error("❌ Errore nella lettura del file JSON:", error);
    }
  }
  const entries = fs.readdirSync(percorsoCartella, { withFileTypes: true });
  const pattern = /^([^_]+)_([^_]+)_([^_]+)_([^_]+)$/;
  const cartellePresenti = entries
    .filter(entry => entry.isDirectory() && pattern.test(entry.name))
    .map(entry => entry.name.trim());
  
  // Creiamo una mappa delle commesse già salvate
  const mapping = {};
  jsonData.forEach(record => {
    mapping[record.nome] = record;
  });
  
  const nuovoArray = cartellePresenti.map(cartella => {
    // Se la commessa esiste, creiamo una copia; altrimenti, ne creiamo una nuova
    let commessa = mapping[cartella] ? { ...mapping[cartella] } : {
      nome: cartella,
      cliente: "",
      brand: "",
      nomeProdotto: "",
      quantita: 0,
      codiceProgetto: "",
      codiceCommessa: "",
      dataConsegna: "",
      presente: true,
      percorso: path.join(percorsoCartella, cartella)
    };
    
    // Se non sono già presenti, aggiorniamo i campi dalla struttura della cartella
    if (!commessa.brand || !commessa.nomeProdotto || !commessa.codiceProgetto || !commessa.codiceCommessa) {
      const match = pattern.exec(cartella);
      if (match) {
        commessa.brand = match[1];
        commessa.nomeProdotto = match[2];
        commessa.codiceProgetto = match[3];
        commessa.codiceCommessa = match[4];
      }
    }
    
    // Forziamo l'aggiornamento del percorso e flag
    commessa.percorso = path.join(percorsoCartella, cartella);
    commessa.presente = true;
    
    // Leggiamo il report.json all'interno della cartella per aggiornare inizioProduzione
   // Leggiamo il report.json per aggiornare inizioProduzione e lo stato "archiviata"
const reportPath = path.join(percorsoCartella, cartella, 'report.json');
if (fs.existsSync(reportPath)) {
  try {
    const rawReport = fs.readFileSync(reportPath, 'utf8');
    console.log(`Raw report per ${cartella}: ${rawReport}`);
    const report = rawReport.trim() ? JSON.parse(rawReport) : {};
 
if (report.fineProduzioneEffettiva) {
commessa.fineProduzioneEffettiva = report.fineProduzioneEffettiva;
}

    
    if (report.inizioProduzione) {
      commessa.inizioProduzione = report.inizioProduzione;
      console.log(`Aggiornato inizioProduzione per ${cartella}: ${report.inizioProduzione}`);
    } else {
      commessa.inizioProduzione = "";
      console.log(`Nessun inizioProduzione per ${cartella}`);
    }
    
    // **Nuova parte: se il report ha il flag "archiviata", aggiungilo all'oggetto commessa**
   if (report.archiviata !== undefined) {
  commessa.archiviata = report.archiviata === true || report.archiviata === "true";
if (report.fineProduzioneEffettiva) {
    commessa.fineProduzioneEffettiva = report.fineProduzioneEffettiva;
  } else {
    commessa.fineProduzioneEffettiva = null;
  }
  console.log(`Aggiornato stato archiviata per ${cartella}:`, commessa.archiviata);
} else {
  commessa.archiviata = false;
}


  } catch (err) {
    console.error(`Errore nella lettura di report.json in ${cartella}:`, err);
  }
}


    return commessa;
  });
  
  try {
    fs.writeFileSync(jsonFilePath, JSON.stringify(nuovoArray, null, 2));
    console.log("🔄 File JSON aggiornato automaticamente");
  } catch (error) {
    console.error("❌ Errore nell'aggiornamento del file JSON:", error);
  }
};

const monitorFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  console.log(`👀 Monitorando il file: ${filePath}`);
  fs.watchFile(filePath, { interval: 1000 }, () => {
    console.log("🔄 Rilevata modifica a commesse.json, aggiornamento...");
    notifyClients();
  });
};

const notifyClients = () => {
  if (!percorsoCartellaMonitorata) {
    console.log("❌ Errore: il percorso della cartella monitorata è NULL!");
    return;
  }
  const jsonFilePath = path.join(percorsoCartellaMonitorata, 'commesse.json');
  if (!fs.existsSync(jsonFilePath)) {
    console.log("❌ Il file JSON delle commesse non esiste!");
    return;
  }
  try {
    const rawData = fs.readFileSync(jsonFilePath, 'utf8');
    const commesse = rawData.trim() ? JSON.parse(rawData) : [];
    // Assicurati che ogni commessa abbia il campo nome
    const commesseConStato = commesse.map(c => {
      if (!c.nome) {
        c.nome = `${c.brand}_${c.nomeProdotto}_${c.codiceProgetto}_${c.codiceCommessa}`;
      }
      return c;
    });
    console.log("📡 WebSocket invia:", JSON.stringify(commesseConStato, null, 2));
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(commesseConStato));
      }
    });
  } catch (error) {
    console.error("❌ Errore nella lettura del file JSON:", error);
  }
};

/* ----------------------- ENDPOINT PER SALVARE LE IMPOSTAZIONI ----------------------- */
app.post('/api/save-settings', (req, res) => {
  const {
    percorsoCartella,
    cartellaDaClonare,
    emailDestinatariApertura,     
    emailDestinatariLavorazione,  
    emailOggetto,
    emailContenuto,
    masterBolleUscita,
    masterBolleEntrata
  } = req.body;

  const settingsData = {
    percorsoCartella,
    cartellaDaClonare,
    emailDestinatariApertura,
    emailDestinatariLavorazione,
    emailOggetto,
    emailContenuto,
    masterBolleUscita,
    masterBolleEntrata
  };

// Protek settings: salva il percorso del file monitoraggio scelto dall’utente
app.get("/api/protek/settings", (req, res) => {
  const file = path.join(__dirname, "data", "Proteksetting.json");
  if (!fs.existsSync(file)) {
    return res.json({ monitorPath: "", pantografi: [] });
  }
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    res.json(data);
  } catch (err) {
    res.json({ monitorPath: "", pantografi: [] });
  }
});

// Recupera impostazioni Protek (GET)
app.get("/api/protek/settings", (req, res) => {
  const file = path.join(__dirname, "data", "Proteksetting.json");
  if (!fs.existsSync(file)) {
    return res.json({ monitorPath: "" });
  }
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    res.json(data);
  } catch (err) {
    res.json({ monitorPath: "" });
  }
});




  try {
    fs.writeFileSync(settingsFilePath, JSON.stringify(settingsData, null, 2));
    console.log("✅ Impostazioni salvate in", settingsFilePath);
    res.json({ message: "Impostazioni salvate con successo." });
  } catch (err) {
    console.error("Errore nel salvataggio delle impostazioni:", err);
    res.status(500).json({ message: "Errore nel salvataggio delle impostazioni.", error: err.toString() });
  }
});

app.get('/api/leggi-impostazioni', (req, res) => {
  if (!fs.existsSync(settingsFilePath)) {
    return res.status(404).json({ message: "File delle impostazioni non trovato." });
  }
  try {
    const rawData = fs.readFileSync(settingsFilePath, 'utf8');
    const settings = rawData.trim() ? JSON.parse(rawData) : {};
    return res.status(200).json({ settings });
  } catch (error) {
    console.error("❌ Errore nella lettura delle impostazioni:", error);
    return res.status(500).json({ message: "Errore nella lettura delle impostazioni.", error: error.toString() });
  }
});

// Endpoint: restituisce il master PDF per la bolla in uscita/entrata
app.get('/api/master-bolla', (req, res) => {
  const tipo = req.query.tipo; // "uscita" o "entrata"
  if (!tipo || (tipo !== "uscita" && tipo !== "entrata")) {
    return res.status(400).send("Tipo non valido. Usa ?tipo=uscita oppure ?tipo=entrata");
  }
  // Leggi il path dal file impostazioni.json
  if (!fs.existsSync(settingsFilePath)) {
    return res.status(404).send("Impostazioni non trovate");
  }
  const raw = fs.readFileSync(settingsFilePath, "utf8");
  const settings = JSON.parse(raw);
  const pathPDF = tipo === "uscita" ? settings.masterBolleUscita : settings.masterBolleEntrata;
  if (!pathPDF || !fs.existsSync(pathPDF)) {
    return res.status(404).send("File master PDF non trovato o non impostato");
  }
  // Invia il PDF come file
  res.sendFile(path.resolve(pathPDF));
});


/* ----------------------- CONTROLLA E CREA REPORT.JSON IN TUTTE LE CARTELLE ----------------------- */
function checkAllReportFiles() {
  if (!fs.existsSync(settingsFilePath)) {
    console.log("File delle impostazioni non trovato, skip controllo report.json.");
    return;
  }
  let settingsData;
  try {
    const raw = fs.readFileSync(settingsFilePath, 'utf8');
    settingsData = JSON.parse(raw);
  } catch (error) {
    console.error("Errore nella lettura delle impostazioni:", error);
    return;
  }
  const baseFolder = settingsData.percorsoCartella;
  if (!baseFolder || !fs.existsSync(baseFolder)) {
    console.log("La cartella di base non è specificata nelle impostazioni o non esiste.");
    return;
  }
  const entries = fs.readdirSync(baseFolder, { withFileTypes: true });
  entries.forEach(entry => {
    if (entry.isDirectory()) {
      const folderPath = path.join(baseFolder, entry.name);
      const reportFilePath = path.join(folderPath, 'report.json');
      if (!fs.existsSync(reportFilePath)) {
        const defaultReport = {};
        try {
          fs.writeFileSync(reportFilePath, JSON.stringify(defaultReport, null, 2));
          console.log(`✅ report.json creato in: ${reportFilePath}`);
        } catch (error) {
          console.error(`❌ Errore nella creazione di report.json in ${folderPath}:`, error);
        }
      }
    }
  });
}

/* ----------------------- AVVIO DEL SERVER CON WEBSOCKET ----------------------- */
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  console.log("🟢 WebSocket CONNESSO!");
  startMonitoring();

  // Ascolta i messaggi per ricevere il messaggio "auth" con l'email dell'utente
 ws.on("message", (message) => {
  try {
    const data = JSON.parse(message);
    if (data.type === "auth") {
      // Controlla che data.email esista, sia una stringa e non sia vuota
      if (!data.email || typeof data.email !== "string" || data.email.trim() === "") {
        console.error("Messaggio auth ricevuto senza email valida:", data);
        return;
      }
      // Associa l'email al WebSocket
      ws.email = data.email;
      // Aggiungi l'utente se non già presente
      if (!activeUsers.find(u => u && typeof u.email === "string" && u.email.toLowerCase() === data.email.toLowerCase())) {
  activeUsers.push({ email: data.email, lastPing: Date.now() });
  notifyActiveUsers();
}

    }
  } catch (err) {
    console.error("Errore nel parsing del messaggio WebSocket:", err);
  }
});




  ws.on("close", () => {
    console.log("🔴 WebSocket Disconnesso!");
    // Se l'utente aveva inviato il suo indirizzo email, rimuovilo dalla lista attiva
    if (ws.email) {
      activeUsers = activeUsers.filter(
        u => u.email.toLowerCase() !== ws.email.toLowerCase()
      );
      notifyActiveUsers();
    }
  });
});

// Esegui il check dei report.json in tutte le cartelle all'avvio del server
checkAllReportFiles();

app.get('/api/loggedUsers', (req, res) => {
  res.json(activeUsers);
});

// Endpoint per servire il file già parsato dal cron
app.get("/api/stampanti-parsed", (req, res) => {
  const parsedPath = path.join(__dirname, "data", "stampanti_parsed.json");
  if (!fs.existsSync(parsedPath)) {
    return res.status(404).json({ message: "Nessun file parsato ancora." });
  }
  const data = fs.readFileSync(parsedPath, "utf8");
  res.json(JSON.parse(data));
});

// 1) Leggi le impostazioni stampanti
app.get("/api/stampanti/settings", (req, res) => {
  const settingsPath = path.join(__dirname, "data", "stampantiSettings.json");
  if (!fs.existsSync(settingsPath)) {
    // nessuna impostazione salvata ancora
    return res.json({});
  }
  try {
    const raw = fs.readFileSync(settingsPath, "utf8");
    // Inviamo TUTTI i campi presenti, compreso reportGeneralePath!
    res.json(JSON.parse(raw));
  } catch (err) {
    console.error("Errore nel leggere stampantiSettings.json:", err);
    res.status(500).json({ error: "Impossibile leggere le impostazioni" });
  }
});


// 2) Salva le impostazioni stampanti (link ACL + json di monitoraggio + report generale)
app.post("/api/stampanti/settings", (req, res) => {
  const { printers, monitorJsonPath, reportGeneralePath } = req.body;
  const settingsDir = path.join(__dirname, "data");
  if (!fs.existsSync(settingsDir)) fs.mkdirSync(settingsDir, { recursive: true });

  // Struttura completa delle impostazioni
  const toSave = {
    printers: Array.isArray(printers) ? printers : [],
    monitorJsonPath: monitorJsonPath || "",
    reportGeneralePath: reportGeneralePath || ""
  };

  fs.writeFileSync(
    path.join(settingsDir, "stampantiSettings.json"),
    JSON.stringify(toSave, null, 2)
  );
  res.json({ ok: true });
});

// 3) Restituisci l’ultimo CSV disponibile
app.get("/api/stampanti/latest-csv", (req, res) => {
  const folder = req.query.folder;
  if (!folder) return res.status(400).json({ error: "folder missing" });
  try {
    const files = fs
      .readdirSync(folder)
      .filter(f => f.toLowerCase().endsWith(".csv"));
    if (!files.length) return res.json({ headers: [], rows: [] });

    // prendi quello più recente
    const latest = files
      .map(name => ({
        name,
        mtime: fs.statSync(path.join(folder, name)).mtimeMs
      }))
      .sort((a, b) => b.mtime - a.mtime)[0].name;

    const content = fs.readFileSync(path.join(folder, latest), "utf8").trim();
const lines = content.split(/\r?\n/);

if (!lines.length) {
  return res.json({ headers: [], rows: [] });
}

const rawHeaders = lines[0]
  .split(";")
  .map(f => f.trim().replace(/^"|"$/g, ""));

const rawRows = lines.slice(1).map(line =>
  line
    .split(";")
    .map(f => f.trim().replace(/^"|"$/g, ""))
);

res.json({ headers: rawHeaders, rows: rawRows });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.toString() });
  }
});


// 3.1) Restituisci il JSON di monitoraggio
app.get("/api/stampanti/monitor", (req, res) => {
  const monitorPath = req.query.path;
  if (!monitorPath || !fs.existsSync(monitorPath)) {
    // nessun file o path non valido: restituisco array vuoto
    return res.json([]);
  }
  try {
    const raw = fs.readFileSync(monitorPath, "utf8").trim();
    const data = raw ? JSON.parse(raw) : [];
    data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    res.json(data);
  } catch (err) {
    console.error("Errore leggendo il monitor JSON:", err);
    res.status(500).json({ error: err.toString() });
  }
});


// Aggiungi questo dove metti gli endpoint delle stampanti:
app.get('/api/storico-settimana', (req, res) => {
    const settingsPath = path.join(__dirname, 'data', 'stampantiSettings.json');
    let reportGeneralePath = "";
    if (fs.existsSync(settingsPath)) {
        try {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            reportGeneralePath = settings.reportGeneralePath || path.join(__dirname, "data");
        } catch (e) {
            reportGeneralePath = path.join(__dirname, "data");
        }
    } else {
        reportGeneralePath = path.join(__dirname, "data");
    }
    // Prendi settimana e anno corrente se non specificato
    let week = parseInt(req.query.week);
    let year = parseInt(req.query.year);
    const now = new Date();
    function getWeekNumber(d) {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
        const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
        return weekNo;
    }
    if (!week) week = getWeekNumber(now);
    if (!year) year = now.getFullYear();
    const file = path.join(reportGeneralePath, `Reportgenerali_Stampanti_${week}_${year}.json`);
    if (!fs.existsSync(file)) return res.json([]);
    try {
        const data = fs.readFileSync(file, 'utf8');
        return res.json(JSON.parse(data));
    } catch(e) {
        return res.json([]);
    }
});



// === DINAMIC REPORT GENERALE STATIC SERVE ===

function getReportGeneraleFolder() {
  const settingsPath = path.join(__dirname, 'data', 'stampantiSettings.json');
  if (!fs.existsSync(settingsPath)) return null;
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const settings = JSON.parse(raw);
    if (settings.reportGeneralePath && fs.existsSync(settings.reportGeneralePath)) {
      return settings.reportGeneralePath;
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Serve QUALSIASI file dalla cartella impostata in reportGeneralePath
app.get('/report_generale/:nomefile', (req, res) => {
  const settingsPath = path.join(__dirname, 'data', 'stampantiSettings.json');
  if (!fs.existsSync(settingsPath)) return res.status(404).send('Impostazioni non trovate');
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const settings = JSON.parse(raw);
    const reportGeneralePath = settings.reportGeneralePath;
    if (!reportGeneralePath || !fs.existsSync(reportGeneralePath)) {
      return res.status(404).send('Cartella REPORT GENERALE non trovata!');
    }
    const nomefile = req.params.nomefile;
    const filePath = path.join(reportGeneralePath, nomefile);
    if (!fs.existsSync(filePath)) return res.status(404).send('File non trovato');
    res.sendFile(filePath);
  } catch (err) {
    return res.status(500).send('Errore interno nel recupero del file');
  }
});


// ========== SCHEDULAZIONE: REPORT GIORNALIERO E FILE SETTIMANALE ==========

// Funzione settimana ISO
function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
    return weekNo;
}

// Funzione principale per merge giornaliero e creazione/aggiornamento settimanale
function mergeDailyIntoWeeklyReport() {
    // Recupera percorso dal file impostazioni stampanti (quello usato dalla tua app)
    const settingsPath = path.join(__dirname, 'data', 'stampantiSettings.json');
    let reportGeneralePath = "";
    if (fs.existsSync(settingsPath)) {
        try {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            reportGeneralePath = settings.reportGeneralePath || path.join(__dirname, "data");
        } catch (e) {
            reportGeneralePath = path.join(__dirname, "data");
        }
    } else {
        reportGeneralePath = path.join(__dirname, "data");
    }

    const now = new Date();
    const week = getWeekNumber(now);
    const year = now.getFullYear();
    const weeklyFile = path.join(reportGeneralePath, `Reportgenerali_Stampanti_${week}_${year}.json`);

    // Leggi/crea il file settimanale (array di job)
    let weekArr = [];
    if (fs.existsSync(weeklyFile)) {
        try { weekArr = JSON.parse(fs.readFileSync(weeklyFile, 'utf8')) || []; } catch(e) { weekArr = []; }
    }

    // Prendi tutti i file giornalieri delle stampanti (escludi quelli già settimanali)
    const files = fs.readdirSync(reportGeneralePath)
  .filter(f => /^Reportgenerali_.*\.json$/.test(f))
  // Escludi file già settimanali E qualsiasi file che abbia più di una volta il pattern _NUMERO_NUMERO
  .filter(f => {
    // Se matcha 2 volte _NUMERO_NUMERO, lo escludo
    const matches = f.match(/_\d{1,2}_\d{4}/g) || [];
    return matches.length < 2 && !/^Reportgenerali_Stampanti_\d+_\d+\.json$/.test(f);
  });


    for (const file of files) {
        const fullPath = path.join(reportGeneralePath, file);
        let arr = [];
        try { arr = JSON.parse(fs.readFileSync(fullPath, 'utf8')) || []; } catch (e) { arr = []; }
        if (arr.length > 0) {
            // Appendi al settimanale e aggiungi info utili
            weekArr.push(...arr.map(riga => ({
                ...riga,
                source: file,
                giorno: now.toISOString().slice(0,10)
            })));
            // Svuota il giornaliero
            fs.writeFileSync(fullPath, "[]", "utf8");
        }
    }
    // Salva/aggiorna il file settimanale
    fs.writeFileSync(weeklyFile, JSON.stringify(weekArr, null, 2), "utf8");
    console.log(`[SCHEDULER] Weekly file aggiornato: ${weeklyFile} (${weekArr.length} record)`);
}

// Schedula ogni giorno a mezzanotte
cron.schedule("0 0 * * *", mergeDailyIntoWeeklyReport);

// Esegui anche all'avvio (così non perdi mai nulla se il server riparte in giornata)
mergeDailyIntoWeeklyReport();

// Restituisce tutte le settimane disponibili come array [{ week: 27, year: 2025 }, ...]
app.get("/api/settimanali-disponibili", (req, res) => {
  const settingsPath = path.join(__dirname, 'data', 'stampantiSettings.json');
  let reportGeneralePath = path.join(__dirname, "data");
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (settings.reportGeneralePath) reportGeneralePath = settings.reportGeneralePath;
    } catch {}
  }
  // Cerca i file settimanali nella cartella reportGeneralePath
  const files = fs.readdirSync(reportGeneralePath)
    .filter(f => /^Reportgenerali_Stampanti_(\d+)_(\d+)\.json$/.test(f));
  const settimane = files.map(f => {
    const m = f.match(/^Reportgenerali_Stampanti_(\d+)_(\d+)\.json$/);
    return m ? { week: Number(m[1]), year: Number(m[2]), filename: f } : null;
  }).filter(Boolean).sort((a, b) => b.year - a.year || b.week - a.week);
  res.json(settimane);
});

// Protek settings: salva il percorso del file monitoraggio scelto dall’utente
app.post("/api/protek/settings", (req, res) => {
  const { monitorPath, pantografi } = req.body;
  const dataDir = path.join(__dirname, "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const protekSettingsFile = path.join(dataDir, "Proteksetting.json");
  try {
    fs.writeFileSync(
      protekSettingsFile,
      JSON.stringify({ monitorPath, pantografi: pantografi || [] }, null, 2),
      "utf8"
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});


// Recupera impostazioni Protek (GET)
app.get("/api/protek/settings", (req, res) => {
  const file = path.join(__dirname, "data", "Proteksetting.json");
  if (!fs.existsSync(file)) {
    return res.json({ monitorPath: "", pantografi: [] });
  }
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    res.json({
      monitorPath: data.monitorPath || "",
      pantografi: data.pantografi || [],
    });
  } catch (err) {
    res.json({ monitorPath: "", pantografi: [] });
  }
});







server.listen(3001, '0.0.0.0', () => {
  console.log("🚀 Server in ascolto su http://192.168.1.250:3001");
});
startMultiPrinterScheduler();





