import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Settings, LogOut, Home } from 'lucide-react';

import { Card, CardContent } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import CalendarSlide from './CalendarSlide';
import CommesseGenerateSlide from './CommesseGenerateSlide';
import 'react-calendar/dist/Calendar.css';
import * as XLSX from 'xlsx';
import SelectedCalendar from './SelectedCalendar';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Portal } from '@radix-ui/react-portal';




// Helper per verificare se il form è valido
function isFormValid(brand, nomeProdotto, codiceProgetto, codiceCommessa) {
  return (
    brand.trim() !== '' &&
    nomeProdotto.trim() !== '' &&
    ((codiceProgetto.trim() !== '') || (codiceCommessa.trim() !== ''))
  );
}

// Helper per calcolare un colore in base all'email
const getUserColor = (email) => {
  const colors = ["#F56565", "#ED8936", "#ECC94B", "#48BB78", "#38B2AC", "#4299E1", "#805AD5", "#D53F8C"];
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

// Helper per gestire le date
const parseDateFromString = (str) => {
  let date;
  if (str.includes('-')) {
    const [year, month, day] = str.split('-');
    date = new Date(year, month - 1, day);
  } else if (str.includes('/')) {
    const [day, month, year] = str.split('/');
    date = new Date(year, month - 1, day);
  } else {
    date = new Date(str);
  }
  return date;
};

const formatLocalDate = (date) => {
  const day = ('0' + date.getDate()).slice(-2);
  const month = ('0' + (date.getMonth() + 1)).slice(-2);
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const formatISODate = (date) => {
  const year = date.getFullYear();
  const month = ('0' + (date.getMonth() + 1)).slice(-2);
  const day = ('0' + date.getDate()).slice(-2);
  return `${year}-${month}-${day}`;
};

const formatDisplayDate = (isoDateString) => {
  const parts = isoDateString.split('-'); // [YYYY, MM, DD]
  if (parts.length !== 3) return isoDateString;
  const day = parts[2];
  const month = parts[1];
  const year = parts[0].slice(-2);
  return `${day}_${month}_${year}`;
};

const calculateWorkingDaysRemaining = (deliveryDate) => {
  if (!deliveryDate) return 0;
  const today = new Date();
  const endDate = new Date(deliveryDate);
  if (today > endDate) return 0;
  let count = 0;
  let currentDate = new Date(today);
  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return count;
};

export default function EspositoriApp({ onLogout, onHome }) {

  // Disabilita lo scrolling della pagina principale
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Logout automatico dopo 5 minuti di inattività
  useEffect(() => {
    let timeoutId;
    const logoutAfterInactivity = () => {
      alert("Logout automatico per inattività!");
      onLogout && onLogout();
    };
    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(logoutAfterInactivity, 300000); // 5 minuti
    };
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    events.forEach(event => window.addEventListener(event, resetTimer));
    resetTimer();
    return () => {
      events.forEach(event => window.removeEventListener(event, resetTimer));
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [onLogout]);

  // Heartbeat: invia un ping ogni 30 secondi
  useEffect(() => {
    const sendPing = async () => {
      const currentUser = localStorage.getItem("currentUser");
      if (!currentUser) return;
      try {
        const user = JSON.parse(currentUser);
        if (user.email) {
          await fetch("http://192.168.1.250:3001/api/ping", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: user.email }),
          });
          console.log("Ping inviato per:", user.email);
        }
      } catch (error) {
        console.error("Errore durante il ping:", error);
      }
    };

    sendPing();
    const intervalId = setInterval(sendPing, 30000);
    return () => clearInterval(intervalId);
  }, []);

  // Stati per form, commesse, impostazioni, ecc.
  const [cliente, setCliente] = useState('');
  const [brand, setBrand] = useState('');
  const [nomeProdotto, setNomeProdotto] = useState('');
  const [quantita, setQuantita] = useState('');
  const [codiceProgetto, setCodiceProgetto] = useState('');
  const [codiceCommessa, setCodiceCommessa] = useState('');
  const [dataConsegna, setDataConsegna] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cartellaDaClonare, setCartellaDaClonare] = useState('');
  const [percorsoCartella, setPercorsoCartella] = useState('');
  const [emailDestinatariApertura, setEmailDestinatariApertura] = useState("");
  const [emailDestinatariLavorazione, setEmailDestinatariLavorazione] = useState("");
  const [reportDdtPath, setReportDdtPath] = useState("");
  const [commesse, setCommesse] = useState([]);
  const [commessaSelezionata, setCommessaSelezionata] = useState(null);
  const [originalNome, setOriginalNome] = useState("");
  const [modificaOpen, setModificaOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortCriteria, setSortCriteria] = useState('dataConsegna');
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedCommessaForCalendar, setSelectedCommessaForCalendar] = useState(null);
  const [modalCalendarOpen, setModalCalendarOpen] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(null);
  const [selectedDeliveries, setSelectedDeliveries] = useState([]);
  const [loggedUsers, setLoggedUsers] = useState([]);
  const [emailOggetto, setEmailOggetto] = useState("");
  const [emailContenuto, setEmailContenuto] = useState("");
  const socketRef = useRef(null);
const [masterBolleUscita, setMasterBolleUscita] = useState("");
const [masterBolleEntrata, setMasterBolleEntrata] = useState("");

  // Aggiorna automaticamente il nome in base ai campi
  useEffect(() => {
    if (modificaOpen) {
      const newNome = `${brand}_${nomeProdotto}_${codiceProgetto}_${codiceCommessa}`;
      setCommessaSelezionata(prev => prev ? { ...prev, nome: newNome } : null);
    }
  }, [brand, nomeProdotto, codiceProgetto, codiceCommessa, modificaOpen]);

  // Recupero degli utenti loggati
  useEffect(() => {
    const fetchLoggedUsers = () => {
      fetch("http://192.168.1.250:3001/api/loggedUsers")
        .then(res => {
          if (!res.ok) throw new Error("Errore nel recupero degli utenti");
          return res.json();
        })
        .then(data => setLoggedUsers(data))
        .catch(err => console.error("Errore nel recupero degli utenti loggati:", err));
    };

    fetchLoggedUsers();
    const intervalId = setInterval(fetchLoggedUsers, 30000);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    let wsActive;
    const connect = () => {
      wsActive = new WebSocket('ws://192.168.1.250:3001');
      wsActive.onopen = () => {
        console.log("WebSocket active users CONNESSO!");
      };
      wsActive.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'activeUsers') {
            setLoggedUsers(message.data);
          }
        } catch (err) {
          console.error("Errore nel parsing del messaggio WebSocket:", err);
        }
      };
      wsActive.onerror = (err) => {
        console.error("WebSocket active users error:", err);
      };
      wsActive.onclose = () => {
        console.log("WebSocket active users CHIUSO. Riconnessione in 3 secondi...");
        setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      if (wsActive) wsActive.close();
    };
  }, []);

  const handleOpenSelectedCalendar = (commessa) => {
    console.log("handleOpenSelectedCalendar called for:", commessa);
    setSelectedCommessaForCalendar(commessa);
    // Imposta null per aprire il calendario senza data selezionata
    setSelectedCalendarDate(null);
    setModalCalendarOpen(true);
  };

const handleCloseCommessa = async () => {
  console.log("handleCloseCommessa: bottone cliccato");
  if (window.confirm("Sei sicuro di voler archiviare la commessa?")) {
    try {
      // Chiamata a /api/report con folderPath passato (assumendo che sia giusto)
      const reportRes = await fetch('http://192.168.1.250:3001/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderPath: folderPath, // assicurati che questo sia il percorso corretto
          reportData: { archiviata: true }
        })
      });
      if (!reportRes.ok) {
        const reportError = await reportRes.json();
        alert("Errore nell'aggiornamento del report: " + reportError.message);
        return;
      }
      // Aggiorna manualmente lo state per forzare il flag archiviata a true
      setIsArchived(true);
      setReportData(prev => ({ ...(prev || {}), archiviata: true }));

      alert("Commessa archiviata!");
    } catch (error) {
      console.error("Errore durante l'archiviazione:", error);
      alert("Errore di connessione al server.");
    }
  }
};




  const handleSelectedCalendarClickDay = (date) => {
    console.log("Data selezionata:", date);
    setSelectedCalendarDate(date);
  };

  useEffect(() => {
    if (percorsoCartella && cartellaDaClonare) {
      fetchCommesse(percorsoCartella, cartellaDaClonare);
    }
  }, [percorsoCartella, cartellaDaClonare]);

  const handleGenerateReport = () => {
    if (!commesse || commesse.length === 0) {
      alert("Nessuna commessa da esportare.");
      return;
    }
    const worksheet = XLSX.utils.json_to_sheet(commesse);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Commesse");
    XLSX.writeFile(workbook, "report_commesse.xlsx");
  };

  useEffect(() => {
    if (commessaSelezionata) {
      console.log("Apertura finestra modifica per:", commessaSelezionata);
      setModificaOpen(true);
    }
  }, [commessaSelezionata]);

  // Caricamento impostazioni
  useEffect(() => {
    fetch("http://192.168.1.250:3001/api/leggi-impostazioni")
      .then(res => {
        if (!res.ok) {
          return { settings: { percorsoCartella: "", cartellaDaClonare: "", emailDestinatariInizio: "", emailDestinatariFine: "" } };
        }
        return res.json();
      })
      .then(data => {
        if (data.settings) {
          setPercorsoCartella(data.settings.percorsoCartella || "");
          setCartellaDaClonare(data.settings.cartellaDaClonare || "");
          setEmailDestinatariApertura(data.settings.emailDestinatariApertura || "");
          setEmailDestinatariLavorazione(data.settings.emailDestinatariLavorazione || "");
          setEmailOggetto(data.settings.emailOggetto || "");
          setEmailContenuto(data.settings.emailContenuto || "");
setMasterBolleUscita(data.settings.masterBolleUscita || "");
    setMasterBolleEntrata(data.settings.masterBolleEntrata || "");
setReportDdtPath(data.settings.reportDdtPath || "");
        }
      })
      .catch(err => console.error("Errore leggendo le impostazioni dal server:", err));
  }, []);

 useEffect(() => {
  const socket = new WebSocket('ws://192.168.1.250:3001');
  socket.onopen = () => {
    console.log("WebSocket CONNESSO per aggiornamenti commesse!");
  };
  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      // Se il messaggio non ha un "type", assumiamo sia l'array di commesse aggiornato
      if (!data.type) {
        console.log("Dati ricevuti via WebSocket:", data);
        setCommesse([...data]);
      } else if (data.type === 'activeUsers') {
        setLoggedUsers(data.data);
      }
    } catch (error) {
      console.error("Errore nel parsing del messaggio WebSocket:", error);
    }
  };
  socket.onerror = (err) => console.error("WebSocket errore:", err);
  socket.onclose = () => console.log("WebSocket chiuso");
  
  // Salva la connessione nel ref se serve
  socketRef.current = socket;

  return () => socket.close();
}, [sortCriteria]); // oppure [] se vuoi una sola connessione


  useEffect(() => {
    if (selectedDate) {
      const filtered = commesse.filter(c => c.dataConsegna === selectedDate);
      setSelectedDeliveries(filtered);
    }
  }, [commesse, selectedDate]);

  const filteredCommesse = useMemo(() => {
    let result = commesse.filter(c => {
      if (!c || !c.nome) return false;
      const query = searchQuery.toLowerCase();
      return (
        c.nome.toLowerCase().includes(query) ||
        (c.cliente && c.cliente.toLowerCase().includes(query)) ||
        (c.brand && c.brand.toLowerCase().includes(query)) ||
        (c.codiceProgetto && c.codiceProgetto.toLowerCase().includes(query)) ||
        (c.codiceCommessa && c.codiceCommessa.toLowerCase().includes(query))
      );
    });
    if (sortCriteria) {
      result = result.slice().sort((a, b) => {
        if (sortCriteria === 'dataConsegna') {
          return new Date(a.dataConsegna).getTime() - new Date(b.dataConsegna).getTime();
        } else if (sortCriteria === 'brand') {
          return (a.brand || "").localeCompare(b.brand || "");
        }
        return 0;
      });
    }
    return result;
  }, [commesse, searchQuery, sortCriteria]);

const deliveriesByDate = commesse.reduce((acc, commessa) => {
  if (commessa.dataConsegna && !commessa.archiviata) {
    const parsedDate = parseDateFromString(commessa.dataConsegna);
    const formattedDate = formatLocalDate(parsedDate);
    if (!acc[formattedDate]) acc[formattedDate] = [];
    acc[formattedDate].push(commessa); // pusha l’intera commessa non archiviata
  }
  return acc;
}, {});

  console.log("Commesse state:", commesse);
  console.log("DeliveriesByDate:", deliveriesByDate);

  const fetchCommesse = async (cartellaPath, cartellaDaClonata) => {
    if (!cartellaPath || !cartellaDaClonata) return;
    try {
      console.log("Chiamata API per ottenere commesse...");
      const response = await fetch(
        `http://192.168.1.250:3001/api/commesse?percorsoCartella=${encodeURIComponent(cartellaPath)}&cartellaDaClonare=${encodeURIComponent(cartellaDaClonata)}`
      );
      if (response.ok) {
        const data = await response.json();
        console.log("Dati ricevuti dal server:", data);
        if (Array.isArray(data.commesse) && data.commesse.length > 0) {
          setCommesse(data.commesse.map(c => ({
  cliente: c.cliente,
  brand: c.brand,
  nomeProdotto: c.nomeProdotto || c.nome,
  quantita: c.quantita,
  codiceProgetto: c.codiceProgetto,
  codiceCommessa: c.codiceCommessa,
  dataConsegna: c.dataConsegna,
  inizioProduzione: c.inizioProduzione,
fineProduzioneEffettiva: c.fineProduzioneEffettiva || null,
  percorso: c.percorso,
  presente: c.presente,
  archiviata: c.archiviata, // aggiunto
  nome: c.nome
})));


        } else {
          setCommesse([]);
        }
      } else {
        console.error("Errore nel recupero delle commesse.");
      }
    } catch (error) {
      console.error("Errore di connessione:", error);
    }
  };

  const handleSelectCommessa = async (commessaNome) => {
    if (!percorsoCartella) {
      console.log("Errore: percorsoCartella non è impostato!");
      return;
    }
    try {
      console.log(`Recupero dettagli per la commessa: ${commessaNome}`);
      const response = await fetch(
        `http://192.168.1.250:3001/api/commessa-dettagli?percorsoCartella=${encodeURIComponent(percorsoCartella)}&commessaNome=${encodeURIComponent(commessaNome)}`
      );
      if (response.ok) {
        const commessa = await response.json();
        console.log("Dettagli ricevuti:", commessa);
        setCliente(commessa.cliente || "");
        setBrand(commessa.brand || "");
        setNomeProdotto(commessa.nomeProdotto || "");
        setQuantita(commessa.quantita || "");
        setCodiceProgetto(commessa.codiceProgetto || "");
        setCodiceCommessa(commessa.codiceCommessa || "");
        setDataConsegna(commessa.dataConsegna || "");
      } else {
        console.error("Errore nel recupero dei dettagli della commessa.");
      }
    } catch (error) {
      console.error("Errore di connessione:", error);
    }
  };

  const handleEditCommessa = (commessa) => {
    if (!commessa || !commessa.nome) {
      console.log("Errore: Nome della commessa non disponibile!");
      return;
    }
    console.log("Commessa selezionata:", commessa);
    setOriginalNome(commessa.nome); // Salva il nome originale
    setCommessaSelezionata(commessa);
    setModificaOpen(true);
    handleSelectCommessa(commessa.nome);
  };

  const handleOpenSettings = () => {
    setModificaOpen(false);
    setSettingsOpen(true);
  };

  // Salva le impostazioni
  const handleSaveSettings = () => {
    console.log("Salvataggio impostazioni:", { percorsoCartella, cartellaDaClonare, emailDestinatariApertura, emailDestinatariLavorazione });
    fetch("http://192.168.1.250:3001/api/save-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        percorsoCartella,
        cartellaDaClonare,
        emailDestinatariApertura,
        emailDestinatariLavorazione,
        emailOggetto,
        emailContenuto,
        masterBolleUscita,
        masterBolleEntrata,
reportDdtPath
      })
    })
      .then(res => {
        if (!res.ok) throw new Error("Errore nel salvataggio delle impostazioni");
        return res.json();
      })
      .then(data => {
        console.log("Impostazioni salvate:", data.message);
        alert("Impostazioni salvate con successo.");
        fetchCommesse(percorsoCartella, cartellaDaClonare);
        setSettingsOpen(false);
      })
      .catch(err => {
        console.error("Errore salvando le impostazioni:", err);
        alert("Errore salvando le impostazioni: " + err);
      });
  };

  const resetForm = () => {
    setCliente('');
    setBrand('');
    setNomeProdotto('');
    setQuantita('');
    setCodiceProgetto('');
    setCodiceCommessa('');
    setDataConsegna('');
  };

  const handleDayClick = (date) => {
    const formattedDate = formatISODate(date);
    console.log("Giorno cliccato:", formattedDate);
    setSelectedDate(formattedDate);
    const filteredDeliveries = commesse.filter(c => c.dataConsegna === formattedDate);
    setSelectedDeliveries(filteredDeliveries);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const normalizedCodiceProgetto = codiceProgetto.startsWith("P") ? codiceProgetto : "P" + codiceProgetto;
    const normalizedCodiceCommessa = codiceCommessa.startsWith("C") ? codiceCommessa : "C" + codiceCommessa;
    const requestData = {
      cliente,
      brand,
      nomeProdotto,
      quantita,
      codiceProgetto: normalizedCodiceProgetto,
      codiceCommessa: normalizedCodiceCommessa,
      dataConsegna,
      percorsoCartella,
      cartellaDaClonare,
      sovrascrivere: false,
    };
    console.log("Request Data:", requestData);
    try {
      let response = await fetch('http://192.168.1.250:3001/api/genera-commessa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      });
      if (response.status === 409) {
        const confirmOverwrite = window.confirm(`La cartella ${requestData.percorsoCartella}/${brand}_${nomeProdotto}_${codiceCommessa} esiste già. Vuoi sovrascriverla?`);
        if (confirmOverwrite) {
          requestData.sovrascrivere = true;
          response = await fetch('http://192.168.1.250:3001/api/genera-commessa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData),
          });
          if (response.ok) {
            alert("Cartella sovrascritta con successo!");
            fetchCommesse(percorsoCartella, cartellaDaClonare);
            handleEmailConfirmation();
          } else {
            alert("Errore nella sovrascrittura della cartella.");
          }
        }
      } else if (response.ok) {
        alert("Cartella creata con successo!");
        fetchCommesse(percorsoCartella, cartellaDaClonare);
        handleEmailConfirmation();
        resetForm();
      } else {
        alert("Errore nella creazione della cartella.");
      }
    } catch (error) {
      console.error("Errore durante la richiesta:", error);
      alert("Errore di connessione al server.");
    }
  };

  const handleSaveEditCommessa = async () => {
  if (!commessaSelezionata || !commessaSelezionata.nome) {
    alert("Errore: nessuna commessa selezionata.");
    return;
  }
  if (quantita !== "" && (isNaN(quantita) || Number(quantita) <= 0)) {
    alert("Errore: la quantità, se compilata, deve essere un numero positivo.");
    return;
  }
  
  const normalizedCodiceProgetto = codiceProgetto.startsWith("P") ? codiceProgetto : "P" + codiceProgetto;
  const normalizedCodiceCommessa = codiceCommessa.startsWith("C") ? codiceCommessa : "C" + codiceCommessa;
  
  const updatedData = {
    nome: commessaSelezionata.nome,
    cliente: cliente || commessaSelezionata.cliente,
    brand: brand || commessaSelezionata.brand,
    nomeProdotto: nomeProdotto || commessaSelezionata.nomeProdotto,
    quantita: quantita,
    codiceProgetto: codiceProgetto || commessaSelezionata.codiceProgetto,
    codiceCommessa: codiceCommessa || commessaSelezionata.codiceCommessa,
    dataConsegna: dataConsegna || commessaSelezionata.dataConsegna,
  };
  
  try {
    const response = await fetch('http://192.168.1.250:3001/api/modifica-commessa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cartellaDaClonare,
        nomeOriginale: originalNome,
        nuovaCommessa: updatedData,
        percorsoCartella
      }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      alert(`Errore nell'aggiornamento della commessa: ${errorData.message}`);
      console.error("Errore server:", errorData);
      return;
    }
    // Destruttura la risposta usando il nome restituito (ad es. "commessa")
    const { commessa } = await response.json();
    alert("Commessa aggiornata con successo!");
    resetForm();
    setCommessaSelezionata(null);
    setModificaOpen(false);
    // Se vuoi semplicemente un refresh della stessa pagina, puoi aggiornare lo stato oppure chiamare fetchCommesse per aggiornare l'elenco
    fetchCommesse(percorsoCartella, cartellaDaClonare);
  } catch (error) {
    console.error("Errore durante l'aggiornamento:", error);
    alert("Errore di connessione al server.");
  }
};

const archiviaCommessa = async (commessa) => {
  if (!window.confirm("Archiviare questa commessa?")) return;
  try {
    await fetch('http://192.168.1.250:3001/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folderPath: commessa.percorso,
        reportData: { archiviata: true }
      })
    });
    // Aggiorna in memoria lo stato archiviata
    setCommesse(prev =>
      prev.map(c =>
        c.nome === commessa.nome ? { ...c, archiviata: true } : c
      )
    );
    alert("Commessa archiviata!");
  } catch (err) {
    console.error("Errore archiviazione:", err);
    alert("Errore nell'archiviazione della commessa.");
  }
};

  const handleDeleteCommessa = async () => {
    if (!commessaSelezionata || !commessaSelezionata.nome) {
      alert("Errore: nessuna commessa selezionata.");
      return;
    }
    const confirmDelete = window.confirm(`Sei sicuro di voler cancellare la commessa ${commessaSelezionata.nome}? Questa operazione eliminerà anche la cartella creata.`);
    if (!confirmDelete) return;
    try {
      const url = `http://192.168.1.250:3001/api/cancella-commessa/${encodeURIComponent(percorsoCartella)}/${encodeURIComponent(commessaSelezionata.nome)}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.ok) {
        alert("Commessa cancellata con successo!");
        setCommesse(prevCommesse => prevCommesse.filter(c => c.nome !== commessaSelezionata.nome));
        resetForm();
        setCommessaSelezionata(null);
        setModificaOpen(false);
      } else {
        const errorData = await response.json();
        alert(`Errore nella cancellazione: ${errorData.message}`);
      }
    } catch (error) {
      console.error("Errore durante la cancellazione:", error);
      alert("Errore di connessione al server durante la cancellazione.");
    }
  };

  const handleEmailConfirmation = () => {
    const confirmEmail = window.confirm("Vuoi inviare un'email di notifica?");
    if (confirmEmail) {
      const pCode = codiceProgetto.startsWith("P") ? codiceProgetto : "P" + codiceProgetto;
      const cCode = codiceCommessa.startsWith("C") ? codiceCommessa : "C" + codiceCommessa;
      const oggettoEmail = `Ho aperto una nuova cartella ${brand}_${nomeProdotto}_${pCode}_${cCode}`;
      const linkCartella = `"\\\\192.168.1.248\\time dati\\ARCHIVIO TECNICO\\ARCHIVIO\\2025\\COMMESSE\\${brand}_${nomeProdotto}_${pCode}_${cCode}"`;
      const corpoEmail = `
Cliente: ${cliente}
Brand: ${brand}
Nome Prodotto: ${nomeProdotto}
Quantità: ${quantita}
Data Consegna: ${dataConsegna}
--------------------------------------
${linkCartella}
      `;
      const mailtoURL = `mailto:${emailDestinatariApertura}?subject=${encodeURIComponent(oggettoEmail)}&body=${encodeURIComponent(corpoEmail)}`;
      window.location.href = mailtoURL;
    }
  };

  return (
    <>
      {/* Contenitore esterno con altezza minima definita */}
      <div className="relative bg-[#28282B] min-h-screen pt-0 pr-4 pb-4 pl-4">

        <CommesseGenerateSlide 
          commesse={commesse}
          archiviaCommessa={archiviaCommessa}
          filteredCommesse={filteredCommesse}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          sortCriteria={sortCriteria}
          setSortCriteria={setSortCriteria}
          handleEditCommessa={handleEditCommessa}
          onSelectDate={(date) => setSelectedDate(date)}
          onOpenCalendar={handleOpenSelectedCalendar}
        />
     <CalendarSlide
  commesse={commesse}
  onClickDay={handleDayClick}
  selectedDate={selectedDate}
  onCommessaClick={(commessa) => {
    setSelectedCommessaForCalendar(commessa);
    setSelectedCalendarDate(commessa.dataConsegna || null);
    setModalCalendarOpen(true);
  }}
/>



        />
        {/* Qui posizioniamo il contenitore centrale in modo assoluto in alto */}
        <div className="absolute top-0 left-[26%] right-[26%]">
          <div className="flex flex-col items-center justify-start bg-[#28282B] pt-4 px-4 pb-4">
            {/* Blocco logo */}
            <div className="mb-8">
              <img src="/Logo Arca.png" alt="Logo Arca" className="w-32" />
              <div className="flex flex-col items-start bg-[#28282B] p-4">
                {/* Blocco logo, pallini e form */}
              </div>
            </div>
            {/* Blocchi per i pallini degli utenti loggati */}
            {loggedUsers.length > 0 && (
              <div className="flex justify-center mt-4 mb-8 space-x-2">
                {loggedUsers.map((user, index) => {
                  const initials = user.email.slice(0, 2).toUpperCase();
                  const bgColor = getUserColor(user.email);
                  return (
                    <div
                      key={index}
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                      style={{ backgroundColor: bgColor }}
                      title={user.email}
                    >
                      {initials}
                    </div>
                  );
                })}
              </div>
            )}
            {!commessaSelezionata && (
              <Card className="w-full max-w-xl shadow-xl" style={{ backgroundColor: 'transparent' }}>
  <CardContent style={{ backgroundColor: 'transparent' }}>
                  <div className="flex justify-between items-center mb-4">
                    <h1 className="text-2xl font-bold text-white">Genera Nuove Commesse</h1>
                    <div className="flex gap-2">
  {/* Bottone Home: quando cliccato, chiama onHome */}
  <button
    onClick={() => onHome && onHome()}
    className="p-2 text-gray-700 hover:text-black"
    title="Home"
  >
    <Home size={24} />
  </button>
                      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                        <DialogTrigger asChild>
                          <button className="p-2 text-gray-700 hover:text-black" title="Impostazioni">
                            <Settings size={24} />
                          </button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-lg bg-white shadow-lg rounded-lg" aria-describedby="dialog-description">
                          <DialogHeader>
                            <DialogTitle>Impostazioni</DialogTitle>
                          </DialogHeader>
                          <p id="dialog-description" className="text-gray-600">Configura i percorsi e i destinatari per le notifiche</p>
                          <div className="grid gap-4 py-4">
                            <div>
                              <label className="block mb-1 font-semibold" htmlFor="percorsoCartella">Percorso di salvataggio</label>
                              <Input id="percorsoCartella" type="text" value={percorsoCartella} onChange={(e) => setPercorsoCartella(e.target.value)} />
                            </div>
                            <div>
                              <label className="block mb-1 font-semibold" htmlFor="cartellaDaClonare">Cartella da Clonare</label>
                              <Input id="cartellaDaClonare" type="text" value={cartellaDaClonare} onChange={(e) => setCartellaDaClonare(e.target.value)} />
                            </div>
                            <div>
                              <label className="block mb-1 font-semibold" htmlFor="emailDestinatariApertura">
                                Destinatari E-mail Apertura Cartella
                              </label>
                              <Input
                                id="emailDestinatariApertura"
                                type="text"
                                value={emailDestinatariApertura}
                                onChange={(e) => setEmailDestinatariApertura(e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="block mb-1 font-semibold" htmlFor="emailDestinatariLavorazione">
                                Destinatari E-mail Inizio/Fine Lavorazione / Consegne
                              </label>
                              <Input
                                id="emailDestinatariLavorazione"
                                type="text"
                                value={emailDestinatariLavorazione}
                                onChange={(e) => setEmailDestinatariLavorazione(e.target.value)}
                              />
                            </div>
     <div>
      <label className="block mb-1 font-semibold" htmlFor="masterBolleUscita">
        Scegli file Bolle in Uscita
      </label>
      <Input
        id="masterBolleUscita"
        type="text"
        placeholder="Percorso file Bolle in Uscita (es: \\\\server\\cartella\\bolleUscita.xlsx)"
        value={masterBolleUscita}
        onChange={e => setMasterBolleUscita(e.target.value)}
      />
    </div>
    <div>
      <label className="block mb-1 font-semibold" htmlFor="masterBolleEntrata">
        Scegli file Bolle in Entrata
      </label>
      <Input
        id="masterBolleEntrata"
        type="text"
        placeholder="Percorso file Bolle in Entrata (es: \\\\server\\cartella\\bolleEntrata.xlsx)"
        value={masterBolleEntrata}
        onChange={e => setMasterBolleEntrata(e.target.value)}
      />
    </div>

<div>
  <label className="block mb-1 font-semibold" htmlFor="reportDdtPath">
    Percorso salvataggio Report DDT
  </label>
  <Input
    id="reportDdtPath"
    type="text"
    placeholder="Percorso dove salvare il report DDT (es: \\\\server\\cartella\\REPORT_DDT)"
    value={reportDdtPath}
    onChange={e => setReportDdtPath(e.target.value)}
  />
</div>


                          </div>
                          <DialogFooter>
                            <Button type="button" onClick={handleSaveSettings}>Salva</Button>
                            <Button type="button" onClick={() => setSettingsOpen(false)}>Chiudi</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                      <button onClick={() => { if (window.confirm("Sei sicuro di voler effettuare il logout?")) { onLogout && onLogout(); } }} className="p-2 text-gray-700 hover:text-black" title="Logout">
                        <LogOut size={24} />
                      </button>
                    </div>
                  </div>
                  <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block mb-1 font-semibold text-white" htmlFor="cliente">Cliente</label>
                      <input id="cliente" type="text" className="w-full rounded border px-2 py-1" value={cliente} onChange={(e) => setCliente(e.target.value.toUpperCase())} />
                    </div>
                    <div>
                      <label className="block mb-1 font-semibold text-blue-500" htmlFor="brand">Brand</label>
                      <input id="brand" type="text" className="w-full rounded border px-2 py-1" value={brand} onChange={(e) => setBrand(e.target.value.toUpperCase())} />
                    </div>
                    <div>
                      <label className="block mb-1 font-semibold text-blue-500" htmlFor="nomeProdotto">Nome Prodotto</label>
                      <input id="nomeProdotto" type="text" className="w-full rounded border px-2 py-1" value={nomeProdotto} onChange={(e) => setNomeProdotto(e.target.value)} required />
                    </div>
                    <div>
                      <label className="block mb-1 font-semibold text-green-500" htmlFor="codiceProgetto">Codice Progetto</label>
                      <input id="codiceProgetto" type="text" className="w-full rounded border px-2 py-1 bg-white" value={codiceProgetto} onChange={(e) => setCodiceProgetto(e.target.value)} />
                    </div>
                    <div>
                      <label className="block mb-1 font-semibold text-green-500" htmlFor="codiceCommessa">Codice Commessa</label>
                      <input id="codiceCommessa" type="text" className="w-full rounded border px-2 py-1 bg-white" value={codiceCommessa} onChange={(e) => setCodiceCommessa(e.target.value)} />
                    </div>
                    <div>
                      <label className="block mb-1 font-semibold text-white" htmlFor="dataConsegna">Data Consegna</label>
                      <input id="dataConsegna" type="date" className="w-full rounded border px-2 py-1 bg-white" value={dataConsegna} onChange={(e) => { console.log("Data di Consegna selezionata:", e.target.value); setDataConsegna(e.target.value); }} />
                    </div>
                    <div>
                      <label className="block mb-1 font-semibold text-white" htmlFor="quantita">Quantità</label>
                      <input id="quantita" type="number" className="w-full rounded border px-2 py-1" value={quantita} onChange={(e) => setQuantita(e.target.value)} />
                    </div>
                    {isFormValid(brand, nomeProdotto, codiceProgetto, codiceCommessa) && (
                      <Button
  type="submit"
  className="mt-4 bg-green-500 text-White border border-gray-300 hover:bg-green-500"
>
  Genera Commessa
</Button>
                    )}
                  </form>
                </CardContent>
              </Card>
            )}
            {modificaOpen && !settingsOpen && (
              <Dialog
                open={modificaOpen}
                onOpenChange={(open) => {
                  if (!open) {
                    resetForm();
                    setCommessaSelezionata(null);
                  }
                  setModificaOpen(open);
                }}
              >
                <DialogContent className="sm:max-w-lg" aria-describedby="dialog-description">
                  <DialogHeader>
                     <DialogTitle className="text-white">Modifica Commessa</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 py-4" >
                    <div>
  <label style={{ color: "white" }} className="block mb-1 font-semibold">Cliente</label>
  <Input
    type="text"
    value={cliente || ""}
    onChange={(e) => setCliente(e.target.value.toUpperCase())}
    className="bg-white rounded border px-2 py-1"
  />
</div>
<div>
  <label style={{ color: "white" }} className="block mb-1 font-semibold">Brand</label>
  <Input
    type="text"
    value={brand || ""}
    onChange={(e) => setBrand(e.target.value.toUpperCase())}
    className="bg-white rounded border px-2 py-1"
  />
</div>
                    <div>
                      <label className="block mb-1 font-semibold text-white">Nome Prodotto</label>
                      <Input
                        type="text"
                        value={nomeProdotto || ""}
                        onChange={(e) => setNomeProdotto(e.target.value)}
                        className="bg-white rounded border px-2 py-1"
                      />
                    </div>
                    <div>
                      <label style={{ color: "white" }} className="block mb-1 font-semibold">Codice Progetto</label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="text"
                          value={codiceProgetto || ""}
                          onChange={(e) => setCodiceProgetto(e.target.value)}
                          className="bg-white rounded border px-2 py-1 flex-1"
                        />
                        <Button
                          type="button"
                          onClick={handleEmailConfirmation}
                          className="bg-gray-400 hover:bg-gray-500 text-white text-sm px-2 py-1"
                        >
                          Invia Mail
                        </Button>
                      </div>
                    </div>
                    <div>
                      <label style={{ color: "white" }} className="block mb-1 font-semibold">Codice Commessa</label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="text"
                          value={codiceCommessa || ""}
                          onChange={(e) => setCodiceCommessa(e.target.value)}
                          className="bg-white rounded border px-2 py-1 flex-1"
                        />
                        <Button
                          type="button"
                          onClick={handleEmailConfirmation}
                          className="bg-gray-400 hover:bg-gray-500 text-white text-sm px-2 py-1"
                        >
                          Invia Mail
                        </Button>
                      </div>
                    </div>
                    <div>
                      <label style={{ color: "white" }} className="block mb-1 font-semibold">Quantità</label>
                      <Input
                        type="number"
                        value={quantita || ""}
                        onChange={(e) => setQuantita(e.target.value)}
                        className="bg-white"
                      />
                    </div>
                    <div>
                      <label style={{ color: "white" }} className="block mb-1 font-semibold">Data Consegna</label>
                      <Input
                        type="date"
                        value={dataConsegna || ""}
                        onChange={(e) => setDataConsegna(e.target.value)}
                        className="bg-white"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" onClick={handleSaveEditCommessa} className="text-white">
                      Salva Modifiche
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        resetForm();
                        setModificaOpen(false);
                        setCommessaSelezionata(null);
                      }}
className="text-white"
                    >
                      Chiudi
                    </Button>
                    <Button type="button" onClick={handleDeleteCommessa} variant="destructive" className="text-white">
                      Cancella Commessa
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </div>
     
     {modalCalendarOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-800 bg-opacity-75">
    <SelectedCalendar
      onClickDay={handleSelectedCalendarClickDay}
      selectedDate={selectedCalendarDate}
      nomeCommessa={selectedCommessaForCalendar ? selectedCommessaForCalendar.nome : ''}
      consegnaDate={selectedCommessaForCalendar?.dataConsegna ? new Date(selectedCommessaForCalendar.dataConsegna) : null}
      lavorazioneStartDate={null}
      folderPath={selectedCommessaForCalendar ? selectedCommessaForCalendar.percorso : ''}
      quantita={selectedCommessaForCalendar ? selectedCommessaForCalendar.quantita : "N.D."}
      archiviata={!!selectedCommessaForCalendar?.archiviata}
      masterBolleEntrata={masterBolleEntrata}
reportDdtPath={reportDdtPath}
      onClose={() => {
        setModalCalendarOpen(false);
        fetchCommesse(percorsoCartella, cartellaDaClonare); // refresh
      }}
    />
  </div>
)}


    </>
  );
}

