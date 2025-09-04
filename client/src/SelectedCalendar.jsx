import React, { useState, useEffect, useRef } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import './calendar-custom.css';
import * as XLSX from 'xlsx';
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import BollaFormUscita from "./BollaFormUscita";
import BollaFormEntrata from "./BollaFormEntrata";
import { PDFDocument } from "pdf-lib";
import { generaBollaEntrataCompleta } from "./utils/generaBollaEntrata";


function estraiCommessa(nome) {
  if (!nome) return "";
  const pezzi = nome.split("_");
  return pezzi.length >= 4 ? pezzi[3].trim() : nome;
}
function oggiStr() {
  const oggi = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${pad(oggi.getDate())}-${pad(oggi.getMonth() + 1)}-${oggi.getFullYear()}`;
}

function calcolaColliDaReport(reportData, quantita) {
  // 1. Se ci sono consegne con bancali, somma tutti i bancali
  if (reportData && Array.isArray(reportData.consegne) && reportData.consegne.length > 0) {
    let somma = 0;
    for (const consegna of reportData.consegne) {
      if (Array.isArray(consegna.bancali) && consegna.bancali.length > 0) {
        somma += consegna.bancali.reduce((tot, b) => tot + (parseInt(b.quantiBancali) || 0), 0);
      }
    }
    if (somma > 0) return somma;
  }
  // 2. Se non ci sono bancali, usa la quantità, se presente, altrimenti 1
  return quantita && Number(quantita) > 0 ? Number(quantita) : 1;
}



/* --------- UTILITIES E CONTROLLI PER BOLLE (USCITA + ENTRATA) ----------- */




/* --------- FUNZIONE GENERA BOLLA USCITA AUTOMATICA con controlli ----------- */
async function generaBollaUscitaAutomatica(commessa, materiali, materialiPath, destinatarioEmail) {
  if (!commessa || !materialiPath) return;

  if (!materiali.length) {
    alert("⚠️ Nessun materiale presente nella distinta! Impossibile generare la bolla.");
    return;
  }

  const descrizioneMancante = materiali.some(
    mat => !mat.Descrizione || String(mat.Descrizione).trim() === ""
  );
  if (descrizioneMancante) {
    alert("⚠️ Almeno una riga materiale ha il campo Descrizione vuoto!\nCompila tutte le descrizioni prima di generare la bolla.");
    return;
  }

  try {
    let numeroBolla = "T";
    try {
      const res = await fetch("http://192.168.1.250:3001/api/prossima-bolla", { method: "GET" });
      const data = await res.json();
      if (data && data.numeroBolla) numeroBolla = `${data.numeroBolla}T`;
    } catch {}

    let masterPDFBuffer = null;
    try {
      const res = await fetch("http://192.168.1.250:3001/api/master-bolla?tipo=uscita");
      if (!res.ok) throw new Error("Master PDF non trovato!");
      masterPDFBuffer = await res.arrayBuffer();
    } catch (e) {
      alert("Errore: master PDF bolla non trovato!");
      return;
    }

    const chunkSize = 18;
    const chunks = [];
    for (let i = 0; i < materiali.length; i += chunkSize) {
      chunks.push(materiali.slice(i, i + chunkSize));
    }
    if (chunks.length === 0) chunks.push([]);

    const commessaStr = estraiCommessa(commessa && commessa.nome);
    const dataFile = oggiStr();

    const finalPdfDoc = await PDFDocument.create();

    // Serve il nome del campo PAG per la paginazione!
    let fieldsList = [];
    try {
      const pdfDocTmp = await PDFDocument.load(masterPDFBuffer);
      const formTmp = pdfDocTmp.getForm();
      fieldsList = formTmp.getFields().map(f => ({ name: f.getName(), type: f.constructor.name }));
    } catch {}

    for (let pageIdx = 0; pageIdx < chunks.length; pageIdx++) {
      const pdfDoc = await PDFDocument.load(masterPDFBuffer);
      const form = pdfDoc.getForm();
      const pdfFieldList = fieldsList;

      // Setta i campi "statici"
      pdfFieldList.forEach(f => {
        const lname = f.name.toLowerCase();
        if (lname.includes("numero documento")) form.getTextField(f.name).setText(numeroBolla);
        else if (lname.includes("data documento")) form.getTextField(f.name).setText(oggiStr());
        else if (lname.includes("commessa")) form.getTextField(f.name).setText(commessaStr);
        else if (lname.includes("data trasporto")) form.getTextField(f.name).setText(oggiStr());
        else if (lname.includes("data ritiro")) form.getTextField(f.name).setText(oggiStr());
      });

      // Materiali sulle righe
      chunks[pageIdx].forEach((mat, idx) => {
        try { form.getTextField(`codice.${idx}`).setText(mat.Cd_AR || ""); } catch {}
        try { form.getTextField(`descrizione.${idx}`).setText(mat.Descrizione || ""); } catch {}
        try {
          let qtaVal = mat.Qta != null ? String(Math.floor(Number(mat.Qta))) : "";
          form.getTextField(`qta.${idx}`).setText(qtaVal);
        } catch {}
      });
      for (let j = chunks[pageIdx].length; j < chunkSize; j++) {
        try { form.getTextField(`codice.${j}`).setText(""); } catch {}
        try { form.getTextField(`descrizione.${j}`).setText(""); } catch {}
        try { form.getTextField(`qta.${j}`).setText(""); } catch {}
      }

      // Colli
      try {
        form.getTextField("colli").setText(String(materiali.length));
      } catch {}

      // Numero pagina!
      const pagField = pdfFieldList.find(f => f.name.toLowerCase().includes("pag"));
      if (pagField) {
        try {
          form.getTextField(pagField.name).setText(`${pageIdx + 1}/${chunks.length}`);
        } catch {}
      }

      form.flatten();
      const [page] = await finalPdfDoc.copyPages(pdfDoc, [0]);
      finalPdfDoc.addPage(page);
    }

    const nomeFile = `DDT_${numeroBolla}_${commessaStr}_${dataFile}.pdf`;
    const pdfBytes = await finalPdfDoc.save();
    const blob = new Blob([pdfBytes], { type: "application/pdf" });

    // Download locale
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeFile;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 500);

    // Salva in MATERIALI
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
        } catch (e) { reject(e); }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  } catch (e) {
    alert("Errore nella generazione o invio della bolla: " + (e?.message || e));
  }
}








// Helper per ottenere la data in formato ISO locale (senza conversione UTC)
const localISODate = (date) => {
  if (!(date instanceof Date)) date = new Date(date);
  const tzOffset = date.getTimezoneOffset() * 60000;
  const localDate = new Date(date.getTime() - tzOffset);
  return localDate.toISOString().split('T')[0];
};

const calculateEndDate = (startDate, workingDaysCount) => {
  let current = new Date(startDate);
  let daysAdded = (current.getDay() !== 0 && current.getDay() !== 6) ? 1 : 0;
  while (daysAdded < workingDaysCount) {
    current.setDate(current.getDate() + 1);
    if (current.getDay() !== 0) daysAdded++;
  }
  current.setHours(23, 59, 0, 0);
  return current;
};

const computeWorkingDaysBetween = (start, end) => {
  let count = 0;
  let current = new Date(start);
  current.setHours(0, 0, 0, 0);
  const final = new Date(end);
  final.setHours(0, 0, 0, 0);
  while (current <= final) {
    if (current.getDay() !== 0) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
};

const getWorkingDaysArray = (start, end) => {
  const days = [];
  let current = new Date(start);
  current.setHours(0, 0, 0, 0);
  const final = new Date(end);
  final.setHours(0, 0, 0, 0);
  while (current <= final) {
    if (current.getDay() !== 0) days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
};

const formatDateDMY = (dateInput) => {
  if (!dateInput) return 'N.D.';
  const date = new Date(dateInput);
  const day = ('0' + date.getDate()).slice(-2);
  const month = ('0' + (date.getMonth() + 1)).slice(-2);
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

export default function SelectedCalendar({
  selectedDate,
  onClickDay,
  onClose,
  nomeCommessa,
  lavorazioneStartDate,
  consegnaDate,
  initialWorkingDays,
  folderPath,
  quantita,
  archiviata,
  masterBolleEntrata,   
reportDdtPath 
}) {
  const nodeRef = useRef(null);
  const calendarContainerRef = useRef(null);

  // Stato per la modale materiali
  const [showMaterialiModal, setShowMaterialiModal] = useState(false);
 
// Stati per i filtri e la tabella della distinta materiali
const [filtroSottocommessa, setFiltroSottocommessa] = useState('');
const [showBollaForm, setShowBollaForm] = useState(false);
const [showBollaFormEntrata, setShowBollaFormEntrata] = useState(false);
const [bollaData, setBollaData] = useState(null);
const [filtroTipoCF, setFiltroTipoCF] = useState('');
const [filtroQtaMaggioreZero, setFiltroQtaMaggioreZero] = useState(true); // TRUE DI DEFAULT
const [materialiTab, setMaterialiTab] = useState([]);
const [caricamentoMateriali, setCaricamentoMateriali] = useState(false);

const commessaMemo = React.useMemo(() => ({
  nome: nomeCommessa,
  folderPath,
  quantita,
  materiali: materialiTab,
}), [nomeCommessa, folderPath, quantita, materialiTab]);

// Imposta i filtri in automatico quando la modale si apre
useEffect(() => {
  if (showMaterialiModal) {
    let sottocommessaDefault = "";
    if (nomeCommessa) {
      const match = nomeCommessa.match(/C([A-Za-z0-9]+)$/i);
      if (match && match[1]) {
        sottocommessaDefault = match[1];
} else {
        const match2 = nomeCommessa.match(/(\d+)$/);
        sottocommessaDefault = match2 ? match2[1] : nomeCommessa;
      }
    }
    setFiltroSottocommessa(sottocommessaDefault || '');
    setFiltroTipoCF('fornitore');
    setFiltroQtaMaggioreZero(true); // Sempre true!
    // NON lanciare qui la ricerca!
  }
  // eslint-disable-next-line
}, [showMaterialiModal, nomeCommessa]);

// Avvia la ricerca SOLO quando tutti i filtri sono pronti
useEffect(() => {
  if (
    showMaterialiModal &&
    filtroSottocommessa !== '' &&
    filtroTipoCF === 'fornitore' &&
    filtroQtaMaggioreZero === true
  ) {
    handleCercaMateriali();
  }
  // eslint-disable-next-line
}, [showMaterialiModal, filtroSottocommessa, filtroTipoCF, filtroQtaMaggioreZero]);



// Funzione di ricerca materiali (come già avevi)
const handleCercaMateriali = async (e) => {
  if (e) e.preventDefault();
  setCaricamentoMateriali(true);

  // Costruisci query string in base ai filtri scelti
  const params = new URLSearchParams();
  if (filtroSottocommessa) params.append('sottocommessa', filtroSottocommessa);
  if (filtroTipoCF) params.append('tipo_cf', filtroTipoCF);
  if (filtroQtaMaggioreZero) params.append('qta_gt_0', '1');

  try {
    const res = await fetch(`http://192.168.1.250:5050/api/materiali?${params.toString()}`);
    if (!res.ok) throw new Error("Errore nella chiamata API");
    const data = await res.json();
    setMaterialiTab(data);
  } catch (err) {
    alert("Errore nel recupero materiali: " + err.message);
    setMaterialiTab([]);
  }
  setCaricamentoMateriali(false);
};

// Funzione per inviare il file Excel (base64) al backend e salvarlo in MATERIALI
async function salvaExcelNelBackend({ folderPath, fileName, excelBlob }) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = async () => {
      const excelData = reader.result; // Data URI base64
      try {
        await fetch("http://192.168.1.250:3001/api/save-excel-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderPath, excelData, fileName }),
        });
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(excelBlob);
  });
}


const handleExportExcel = async (materials = materialiTab) => {
  const commessaNome = nomeCommessa ? nomeCommessa : "";
  const commessaHeader = [[`Commessa: ${commessaNome}`], []];

  const headers = [
    "Cliente/Fornitore",
    "Articolo",
    "Qta",
    "Descrizione",
    "Note",
    "Prezzo Unit.",
    "Data Consegna"
  ];

  const dataToExport = (materials || []).map(row => [
    row.ClienteFornitore,
    row.Cd_AR,
    Number(row.Qta).toFixed(2),
    row.Descrizione,
    row.NoteRiga || "",
    Number(row.PrezzoUnitarioV).toFixed(4),
    row.DataConsegna
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet([
    ...commessaHeader,
    headers,
    ...dataToExport,
  ]);
  worksheet['!cols'] = headers.map((header, colIdx) => {
    const maxLen = [
      header,
      ...dataToExport.map(riga => riga[colIdx] ? String(riga[colIdx]) : "")
    ].reduce((a, b) => Math.max(a, b.length ? b.length : b), 0);
    return { wch: Math.max(maxLen + 2, 12) };
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Distinta Materiali");

  // Download per browser
  const excelBuffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const excelBlob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const fileName = `DistintaMateriali_${commessaNome}.xlsx`;

  // Download per browser
  const url = window.URL.createObjectURL(excelBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); window.URL.revokeObjectURL(url); }, 500);

  // --- 2. Salvataggio nella cartella MATERIALI del server ---
  let materialiPath = folderPath;
  if (materialiPath && !materialiPath.endsWith("/MATERIALI")) {
    materialiPath = materialiPath + "/MATERIALI";
  }
  try {
    await salvaExcelNelBackend({
      folderPath: materialiPath,
      fileName,
      excelBlob,
    });
    // alert("Excel salvato anche sul server!") // opzionale
  } catch (e) {
    alert("⚠️ Non sono riuscito a salvare l’Excel sul server nella cartella MATERIALI.");
  }
};



const handleExportBollaUscita = async () => {
  try {
    // Scarica il PDF master dal backend (già configurato nelle impostazioni)
    const res = await fetch("http://192.168.1.250:3001/api/master-bolla?tipo=uscita");
    if (!res.ok) throw new Error("PDF Master non trovato! Controlla impostazioni.");
    const blob = await res.blob();

    // Fai scaricare il file al browser
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Bolla_Uscita_${nomeCommessa || ""}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    alert("Errore nel download del PDF Master: " + err.message);
  }
};







  // Email destinatari
  const [emailDestinatariLavorazione, setEmailDestinatariLavorazione] = useState("");

  useEffect(() => {
    fetch("http://192.168.1.250:3001/api/leggi-impostazioni")
      .then(res => res.json())
      .then(impostazioni => {
        setEmailDestinatariLavorazione(impostazioni.settings?.emailDestinatariLavorazione || "");
      });
  }, []);

  function sendMailEvento(tipo, extra = {}) {
    let subject = '';
    let body = '';

    if (tipo === "inizio") {
      subject = ` Avvio produzione - ${nomeCommessa}`;
      body =
        `Commessa: ${nomeCommessa}\n` +
        `Quantità: ${quantita}\n` +
        `Data inizio produzione: ${extra.data || "-"}\n` +
        `Giorni lavorativi previsti: ${extra.giorniPrevisti || "-"}\n`;
    } else if (tipo === "fine") {
      subject = ` Fine produzione - ${nomeCommessa}`;
      body =
        `Commessa: ${nomeCommessa}\n` +
        `Quantità: ${quantita}\n` +
        `Data fine produzione: ${extra.data || "-"}\n` +
        `Giorni lavorativi effettivi: ${extra.giorniEffettivi || "-"}\n`;
    } else if (tipo === "consegna") {
      subject = ` Consegna effettuata - ${nomeCommessa}`;
      body =
        `Commessa: ${nomeCommessa}\n` +
        `Data consegna: ${extra.dataConsegna || "-"}\n` +
        `Pezzi consegnati: ${extra.pezziConsegnati || "-"}\n` +
        `Luogo: ${extra.luogo || "-"}\n` +
        `Trasportatore: ${extra.trasportatore || "-"}\n` +
        `N° DDT: ${extra.nddt || "-"}\n`;
    } else {
      subject = ` Evento produzione`;
      body = `Commessa: ${nomeCommessa}`;
    }
    const destinatari = emailDestinatariLavorazione;
    const mailtoURL = `mailto:${encodeURIComponent(destinatari)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoURL;
  }



  // Stati per Report Produzione
  const [productionDetails, setProductionDetails] = useState([]);
  const [workingDays, setWorkingDays] = useState(initialWorkingDays ? parseInt(initialWorkingDays, 10) : 0);
  const [showWorkingDaysModal, setShowWorkingDaysModal] = useState(false);
  const [tempWorkingDays, setTempWorkingDays] = useState(workingDays.toString());
  const [frozenStartDate, setFrozenStartDate] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [showFineModal, setShowFineModal] = useState(false);
  const [finalized, setFinalized] = useState(false);
  const [finalizedEndDate, setFinalizedEndDate] = useState(null);
  const [showProductionDetailsModal, setShowProductionDetailsModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  // Stati per Report Consegne
  const [deliveries, setDeliveries] = useState([]);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [deliveryLuogo, setDeliveryLuogo] = useState('');
  const [deliveryTrasportatore, setDeliveryTrasportatore] = useState('');
  const [deliveryNddt, setDeliveryNddt] = useState('');
  const [deliveryEditIndex, setDeliveryEditIndex] = useState(null);
const [prezzoVendita, setPrezzoVendita] = useState('');

  // Stati per la modale slide di Bancali
  const [showBancaleModal, setShowBancaleModal] = useState(false);
  const [pzPerBancale, setPzPerBancale] = useState('');
  const [codiceProdotto, setCodiceProdotto] = useState('');
  const [tipoDiBancale, setTipoDiBancale] = useState('');
  const [quantiBancali, setQuantiBancali] = useState('');
  const [tempBancali, setTempBancali] = useState([]);
  const [bancali, setBancali] = useState([]);

  const totPezzi = tempBancali.reduce((acc, bancale) => acc + (bancale.pzPerBancale * bancale.quantiBancali), 0);
  const totBancali = tempBancali.reduce((acc, bancale) => acc + bancale.quantiBancali, 0);

  const totPezziConsegna = deliveries.reduce((acc, delivery) => {
    const totDelivery = delivery.bancali
      ? delivery.bancali.reduce((acc2, b) => acc2 + (b.pzPerBancale * b.quantiBancali), 0)
      : 0;
    return acc + totDelivery;
  }, 0);

  const saldo = Number(quantita) - totPezziConsegna;

  useEffect(() => { setIsArchived(archiviata); }, [archiviata]);
  const [isArchived, setIsArchived] = useState(false);

  const handleAggiungiBancale = () => {
    const nome = prompt("Inserisci il nome del bancale:");
    const descrizione = prompt("Inserisci una descrizione:");
    if (nome) setBancali(prev => [...prev, { nome, descrizione }]);
  };

  const handleDeleteBancale = (index) => {
    if (window.confirm("Sei sicuro di voler eliminare questo bancale?")) {
      setTempBancali(prev => prev.filter((_, i) => i !== index));
    }
  };

  const handleEditBancale = (index) => {
    const bancaleToEdit = tempBancali[index];
    setPzPerBancale(bancaleToEdit.pzPerBancale.toString());
    setCodiceProdotto(bancaleToEdit.codiceProdotto);
    setTipoDiBancale(bancaleToEdit.tipoDiBancale);
    setQuantiBancali(bancaleToEdit.quantiBancali.toString());
    setTempBancali(prev => prev.filter((_, i) => i !== index));
    setShowBancaleModal(true);
  };

  const isSameDay = (d1, d2) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  const handleDeleteDelivery = (index) => {
    if (window.confirm("Sei sicuro di voler eliminare questa consegna?")) {
      const updatedDeliveries = deliveries.filter((_, idx) => idx !== index);
      setDeliveries(updatedDeliveries);
      updateReport(
        workingDays,
        reportData?.inizioProduzione,
        reportData?.fineProduzionePrevista,
        reportData?.totGiorniLavorazioneEffettivi,
        finalized,
        productionDetails
      );
    }
  };

  const handleInsertDeliveryClick = () => {
    if (!selectedDate) {
      alert("Seleziona una data prima!");
      return;
    }
    setDeliveryLuogo('');
    setDeliveryTrasportatore('');
    setDeliveryNddt('');
    setDeliveryEditIndex(null);
    setTempBancali([]);
    setShowDeliveryModal(true);
  };

  const handleSaveDelivery = () => {
    const newDelivery = {
      date: new Date(selectedDate),
      bancali: tempBancali,
      luogo: deliveryLuogo,
      trasportatore: deliveryTrasportatore,
      nddt: deliveryNddt,
    };

    let updatedDeliveries = [];
    if (deliveryEditIndex !== null) {
      updatedDeliveries = deliveries.map((delivery, idx) =>
        idx === deliveryEditIndex ? newDelivery : delivery
      );
      setDeliveryEditIndex(null);
    } else {
      updatedDeliveries = [...deliveries, newDelivery];
    }
    setDeliveries(updatedDeliveries);
    setTempBancali([]);
    setShowDeliveryModal(false);

    fetch(`http://192.168.1.250:3001/api/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folderPath,
        reportData: {
          ...((reportData && typeof reportData === 'object') ? reportData : {}),
          consegne: updatedDeliveries,
          archiviata: isArchived || false,
        },
      }),
    })
      .then((res) => res.json())
      .catch((err) => {
        console.error("Errore nel salvataggio del report.json (solo consegne):", err);
      });

    sendMailEvento('consegna', {
      dataConsegna: formatDateDMY(selectedDate),
      pezziConsegnati: totPezzi,
      luogo: deliveryLuogo,
      trasportatore: deliveryTrasportatore,
      nddt: deliveryNddt
    });
  };

  const handleEditDelivery = (index) => {
    const delivery = deliveries[index];
    setDeliveryLuogo(delivery.luogo);
    setDeliveryTrasportatore(delivery.trasportatore);
    setDeliveryNddt(delivery.nddt);
    setDeliveryEditIndex(index);
    setTempBancali(delivery.bancali || []);
    setShowDeliveryModal(true);
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        showWorkingDaysModal ||
        showFineModal ||
        showProductionDetailsModal ||
        showReportModal ||
        showDeliveryModal ||
        showBancaleModal
      )
        return;
      if (
        calendarContainerRef.current &&
        !calendarContainerRef.current.contains(event.target) &&
        event.target.tagName !== "BUTTON"
      ) {
        onClickDay(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [
    onClickDay,
    showWorkingDaysModal,
    showFineModal,
    showProductionDetailsModal,
    showReportModal,
    showDeliveryModal,
    showBancaleModal,
  ]);

  useEffect(() => {
    if (folderPath) {
      fetch(`http://192.168.1.250:3001/api/report?folderPath=${encodeURIComponent(folderPath)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.report) {
            if (data.report.totGiorniLavorativiPrevisti !== undefined) {
              const loadedDays = parseInt(data.report.totGiorniLavorativiPrevisti, 10);
              if (!isNaN(loadedDays)) {
                setWorkingDays(loadedDays);
              }
            }
            if (data.report.inizioProduzione) {
              setFrozenStartDate(new Date(data.report.inizioProduzione));
            }
            if (data.report.fineProduzioneEffettiva) {
              setFinalized(true);
              setFinalizedEndDate(new Date(data.report.fineProduzioneEffettiva));
            }
            if (data.report.dettagliProduzione) {
              setProductionDetails(data.report.dettagliProduzione);
            }
            if (data.report.consegne) {
              setDeliveries(data.report.consegne.map((d) => ({ ...d, date: new Date(d.date) })));
            }
            setReportData(data.report);
          }
if (data.report.prezzoVendita !== undefined && data.report.prezzoVendita !== null) {
  setPrezzoVendita(String(data.report.prezzoVendita));
}

        })
        .catch((err) => console.error("Errore nel caricamento del report.json:", err));
    }
  }, [folderPath]);

  useEffect(() => {
    if (reportData) {
      updateReport(
        workingDays,
        reportData.inizioProduzione,
        reportData.fineProduzionePrevista,
        reportData.totGiorniLavorazioneEffettivi,
        finalized,
        productionDetails
      );
    }
  }, [deliveries]);

  const updateReport = (
    wd = workingDays,
    newStartDate = null,
    newEndDate = null,
    actualDays = null,
    finalize = false,
    productionDetailsData = null,
    forcedArchived,
    cb
  ) => {
    if (!folderPath) return;
    const startDate = newStartDate
      ? new Date(newStartDate)
      : frozenStartDate
      ? new Date(frozenStartDate)
      : lavorazioneStartDate
      ? new Date(lavorazioneStartDate)
      : selectedDate
      ? new Date(selectedDate)
      : null;
    let endDate;
    if (finalize && reportData && reportData.fineProduzionePrevista) {
      endDate = new Date(reportData.fineProduzionePrevista);
    } else if (newEndDate) {
      endDate = new Date(newEndDate);
    } else if (startDate) {
      endDate = calculateEndDate(startDate, wd);
    }
    const archivedFlag = forcedArchived !== undefined ? forcedArchived : isArchived;
    const newReportData = {
      archiviata: archivedFlag,
      inizioProduzione: startDate ? localISODate(startDate) : null,
      fineProduzionePrevista: endDate ? localISODate(endDate) : null,
      totGiorniLavorativiPrevisti: wd,
      totGiorniLavorazioneEffettivi:
        actualDays !== null
          ? actualDays
          : reportData
          ? reportData.totGiorniLavorazioneEffettivi
          : wd,
      fineProduzioneEffettiva: finalize && newEndDate ? localISODate(newEndDate) : reportData ? reportData.fineProduzioneEffettiva : null,
      dettagliProduzione: productionDetailsData ? productionDetailsData : reportData ? reportData.dettagliProduzione : [],
      consegne: deliveries,
  prezzoVendita: prezzoVendita,
    };
    fetch(`http://192.168.1.250:3001/api/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath, reportData: newReportData }),
    })
      .then(res => res.json())
      .then(data => {
        setReportData(newReportData);
        if (typeof cb === 'function') cb();
      })
      .catch((err) => console.error("Errore nell'aggiornamento del report.json:", err));
  };

const savePrezzoVendita = async () => {
  if (!folderPath) return;
  const value = (prezzoVendita ?? "").toString().replace(",", ".");
  const reportAggiornato = {
    ...((reportData && typeof reportData === 'object') ? reportData : {}),
    prezzoVendita: value === "" ? "" : Number(value),
  };
  try {
    await fetch(`http://192.168.1.250:3001/api/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath, reportData: reportAggiornato }),
    });
    setReportData(reportAggiornato);
    setPrezzoVendita(value); // riflette la normalizzazione
    alert("Prezzo vendita salvato!");
  } catch (err) {
    console.error("Errore salvataggio prezzoVendita:", err);
    alert("Errore nel salvataggio del prezzo vendita");
  }
};


  const resetWorkingDays = () => {
    if (window.confirm("Sei sicuro di voler cancellare la lavorazione?")) {
      setWorkingDays(0);
      setFrozenStartDate(null);
      setFinalized(false);
      setFinalizedEndDate(null);
      setProductionDetails([]);
      setDeliveries([]);
      const clearedReportData = {
        archiviata: reportData ? reportData.archiviata : false,
        inizioProduzione: null,
        fineProduzionePrevista: null,
        totGiorniLavorativiPrevisti: 0,
        totGiorniLavorazioneEffettivi: 0,
        fineProduzioneEffettiva: null,
        dettagliProduzione: [],
        consegne: [],
      };
      setReportData(clearedReportData);
      updateReport(0, null, null, 0, false, [], undefined, () => {
        if (folderPath) {
          fetch(`http://192.168.1.250:3001/api/report?folderPath=${encodeURIComponent(folderPath)}`)
            .then(res => res.json())
            .then(data => {
              if (data.report) setReportData(data.report);
            });
        }
      });
    }
  };

  const handleWorkingDaysSave = async () => {
  const parsed = parseInt(tempWorkingDays, 10);
  if (isNaN(parsed) || parsed <= 0) {
    setWorkingDays(0);
    setTempWorkingDays('');
    updateReport(0, selectedDate);
    setShowWorkingDaysModal(false);
    return;
  }

  setWorkingDays(parsed);
  if (selectedDate) {
    setFrozenStartDate(selectedDate);
    const inizioProduzione = localISODate(new Date(selectedDate));
    updateReport(parsed, inizioProduzione);
    sendMailEvento('inizio', {
      data: formatDateDMY(selectedDate),
      giorniPrevisti: parsed
    });
  }

  // === PATCH SOTTOCOMMESSA FILTRO SICURO ===
  let sottocommessaDefault = "";
  if (nomeCommessa) {
    const match = nomeCommessa.match(/C([A-Za-z0-9]+)$/i);
    if (match && match[1]) {
      sottocommessaDefault = match[1];
    } else {
      const match2 = nomeCommessa.match(/(\d+)$/);
      sottocommessaDefault = match2 ? match2[1] : nomeCommessa;
    }
  }
  const filtroSottocommessaReal = sottocommessaDefault || filtroSottocommessa || nomeCommessa;
  const filtroTipoCFReal = filtroTipoCF || "fornitore";
  const filtroQtaMaggioreZeroReal = filtroQtaMaggioreZero !== undefined ? filtroQtaMaggioreZero : true;

  const params = new URLSearchParams();
  if (filtroSottocommessaReal) params.append('sottocommessa', filtroSottocommessaReal);
  if (filtroTipoCFReal) params.append('tipo_cf', filtroTipoCFReal);
  if (filtroQtaMaggioreZeroReal) params.append('qta_gt_0', '1');
  let materials = [];
  try {
    const res = await fetch(`http://192.168.1.250:5050/api/materiali?${params.toString()}`);
    if (res.ok) {
      materials = await res.json();
    }
  } catch { /* fallback materials resta [] */ }

  await handleExportExcel(materials);

  let materialiPath = folderPath;
  if (materialiPath && !materialiPath.endsWith("/MATERIALI")) {
    materialiPath = materialiPath + "/MATERIALI";
  }
  await generaBollaUscitaAutomatica(commessaMemo, materials, materialiPath, emailDestinatariLavorazione);

  alert("Distinta materiali e bolla di uscita generate!");
  setShowWorkingDaysModal(false);
};










  const handleInizioLavorazione = () => {
    setShowWorkingDaysModal(true);
  };

  const handleFineLavorazione = () => {
    setShowFineModal(true);
  };

  const confirmFineLavorazione = () => {
    if (!selectedDate) return;
    const actualDays =
      reportData && reportData.inizioProduzione && selectedDate
        ? computeWorkingDaysBetween(new Date(reportData.inizioProduzione), new Date(selectedDate))
        : 0;
    setFinalizedEndDate(selectedDate);
    updateReport(workingDays, reportData.inizioProduzione, selectedDate, actualDays, true);
    setShowFineModal(false);
    setFinalized(true);
    const daysArray = getWorkingDaysArray(new Date(reportData.inizioProduzione), new Date(selectedDate));
    
    // Costruisco i dettagli produzione con operatori e ore a zero di default
    const details = daysArray.map((day, index) => ({
      giorno: index + 1,
      data: formatDateDMY(day),
      numOperatori: '',
      oreImpiegate: '',
      totaleOreGG: 0,
    }));
    setProductionDetails(details);
    setShowProductionDetailsModal(true);
  };

  const handleProductionDetailsChange = (index, field, value) => {
  const newDetails = [...productionDetails];
  newDetails[index] = { ...newDetails[index], [field]: value };

  // Calcolo totale ore solo se entrambi i valori sono numerici validi
  const num = newDetails[index].numOperatori;
  const ore = newDetails[index].oreImpiegate;

  if (
    num !== '' && !isNaN(Number(num)) &&
    ore !== '' && !isNaN(Number(ore))
  ) {
    newDetails[index].totaleOreGG = Number(num) * Number(ore);
  } else {
    newDetails[index].totaleOreGG = 0;
  }

  setProductionDetails(newDetails);
};


  const saveProductionDetails = () => {
    updateReport(
      workingDays,
      reportData.inizioProduzione,
      reportData.fineProduzionePrevista,
      reportData.totGiorniLavorazioneEffettivi,
      true,
      productionDetails
    );
    setShowProductionDetailsModal(false);

    // Dopo il salvataggio, chiedi se inviare la mail
    setTimeout(() => {
      if (window.confirm("Vuoi inviare il report produzione via mail?")) {
        const emailBody = buildEmailBody();
        window.location.href = `mailto:${encodeURIComponent(emailDestinatariLavorazione)}?subject=Report Produzione : ${encodeURIComponent(nomeCommessa)}&body=${emailBody}`;
      }
    }, 100);
  };

  const allFieldsFilled = productionDetails.every(
    (detail) =>
      detail.numOperatori !== undefined &&
      detail.numOperatori !== '' &&
      detail.oreImpiegate !== undefined &&
      detail.oreImpiegate !== ''
  );

  const handleCloseCommessa = async () => {
  if (!window.confirm("Sei sicuro di voler archiviare la commessa?")) return;
  if (window.confirm("Vuoi generare il report PDF?")) {
    handleGeneratePDFReport();
  }
  try {
    await fetch('http://192.168.1.250:3001/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folderPath: folderPath,
        reportData: { archiviata: true },
      }),
    });
    updateReport(
      workingDays,
      reportData?.inizioProduzione,
      reportData?.fineProduzionePrevista,
      reportData?.totGiorniLavorazioneEffettivi,
      finalized,
      productionDetails,
      true
    );
    alert("Commessa archiviata!");
    setIsArchived(true);
    setReportData((prev) => ({ ...(prev || {}), archiviata: true }));
    {
      const emailBody = buildEmailBody();
      window.location.href =
        `mailto:?subject=Report Commessa ${nomeCommessa}&body=${emailBody}`;
    }
    setReportData((prev) => ({ ...(prev || {}), archiviata: true }));
    {
      const emailBody = buildEmailBody();
      window.location.href =
        `mailto:?subject=Report Commessa ${nomeCommessa}&body=${emailBody}`;
    }

    let materialiPath = folderPath;
if (materialiPath && !materialiPath.endsWith("/MATERIALI")) {
  materialiPath = materialiPath + "/MATERIALI";
}
await generaBollaEntrataCompleta({
  commessa: commessaMemo,
  materialiPath,
  reportDdtPath,
});

// Dopo la generazione bolla, aggiorna l’Excel DDT!
if (reportDdtPath && materialiPath && commessaMemo) {
  // Estrai codice commessa
  let codiceCommessa = "";
  if (commessaMemo.codiceCommessa) {
    codiceCommessa = String(commessaMemo.codiceCommessa).replace(/[^a-zA-Z0-9]/g, "");
  } else if (commessaMemo.nome) {
    const match = commessaMemo.nome.match(/_C([a-zA-Z0-9]+)$/);
    codiceCommessa = match ? "C" + match[1] : commessaMemo.nome;
  }

  // Calcola Colli (come sopra)
  let colli = 0;
  if (reportData && Array.isArray(reportData.consegne) && reportData.consegne.length > 0) {
    for (const consegna of reportData.consegne) {
      if (Array.isArray(consegna.bancali) && consegna.bancali.length > 0) {
        colli += consegna.bancali.reduce((tot, b) => tot + (parseInt(b.quantiBancali) || 0), 0);
      }
    }
  }
  if (colli === 0) colli = commessaMemo.quantita ? parseInt(commessaMemo.quantita) : 1;

  // Calcola Ore Lavorazione
  let oreLavorazione = 0;
  if (Array.isArray(productionDetails)) {
    oreLavorazione = productionDetails.reduce((acc, d) => acc + (parseFloat(d.totaleOreGG) || 0), 0);
  }

  const datiDdt = {
  codiceCommessa,
  quantita: commessaMemo.quantita || "",
  folderPath: commessaMemo.folderPath || "",
  colli: colli,
  oreLavorazione: oreLavorazione,
  nomeCommessa: commessaMemo.nome || "",
  prezzoVendita: (prezzoVendita ?? "").toString() // <<< PASSIAMO IL PREZZO MANUALE
};



  await fetch("http://192.168.1.250:3001/api/genera-ddt-excel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      reportDdtPath: reportDdtPath,
      datiDdt: datiDdt
    })
  });
}



    onClose();
  } catch (error) {
    console.error("Errore durante l'archiviazione:", error);
    alert("Errore di connessione al server.");
  }
};


  const buildEmailBody = (skipDetails = false) => {
  let body = `Report Produzione:\n\n`;
  if (reportData) {
    body += `Inizio produzione: ${formatDateDMY(reportData.inizioProduzione) || "N.D."}\n`;
    body += `Fine prod. prevista: ${formatDateDMY(reportData.fineProduzionePrevista) || "N.D."}\n`;
    body += `Giorni lav. previsti: ${reportData.totGiorniLavorativiPrevisti || "N.D."}\n\n`;
    if (finalized) {
      body += `Fine produzione: ${formatDateDMY(finalizedEndDate) || "N.D."}\n\n`;
      body += `Tempi di produzione:\n`;
      const totOre = productionDetails ? productionDetails.reduce((acc, d) => acc + (parseFloat(d.totaleOreGG) || 0), 0) : 0;
      body += `Ore totali produzione: ${totOre}\n`;
      body += `Minuti a pz: ${(quantita && Number(quantita) > 0) ? ((totOre * 60) / Number(quantita)).toFixed(2) : "N.D."}\n`;
      body += `Secondi a pz: ${(quantita && Number(quantita) > 0) ? ((totOre * 3600) / Number(quantita)).toFixed(2) : "N.D."}\n\n`;

      if (!skipDetails && productionDetails && productionDetails.length > 0) {
        body += "Dettagli Produzione:\n";
        productionDetails.forEach(detail => {
          body += `Giorno: ${detail.giorno}, Data: ${detail.data}, Operatori: ${detail.numOperatori}, Ore: ${detail.oreImpiegate}, Totale: ${detail.totaleOreGG}\n`;
        });
      }
    }
  } else {
    body += "Nessun dato disponibile.\n";
  }
  return encodeURIComponent(body);
};



  const loadImageDimensions = (src) =>
    new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = reject;
      img.src = src;
    });

  const handleGeneratePDFReport = async () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    let yPos = 15;

    // LOGO (se vuoi)
    const logoData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAk4AAACeCAYAAADE+IXzAAAACXBIWXMAAC4jAAAuIwF4pT92AAAE8WlUWHRY...";
    try {
      const dimensions = await loadImageDimensions(logoData);
      const desiredWidth = 30; // mm
      const scale = desiredWidth / dimensions.width;
      const desiredHeight = dimensions.height * scale;
      doc.addImage(logoData, "PNG", 15, 10, desiredWidth, desiredHeight);
    } catch (err) { }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0, 102, 204);
    doc.text(`Commessa: ${nomeCommessa}`, 195, 15, { align: "right" });
    doc.setLineWidth(0.5);
    doc.setDrawColor(150);
    doc.line(15, 30, 195, 30);
    yPos = 35;

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80, 80, 80);
    doc.text("REPORT PRODUZIONE", 15, yPos);
    yPos += 10;

    doc.setLineWidth(0.3);
    doc.rect(15, yPos - 5, 180, 28);

    const leftColX = 15 + 5;
    const rightColX = 105 + 5;
    const boxHeight = 28;
    const lineHeight = 5;

    const leftColumnLines = [
      { label: "Inizio produzione", value: reportData && reportData.inizioProduzione ? formatDateDMY(reportData.inizioProduzione) : "N.D.", color: [0, 102, 204] },
      { label: "Fine prod. prevista", value: reportData && reportData.fineProduzionePrevista ? formatDateDMY(reportData.fineProduzionePrevista) : "N.D.", color: [80, 80, 80] },
      { label: "Giorni lavorativi previsti", value: reportData && reportData.totGiorniLavorativiPrevisti ? reportData.totGiorniLavorativiPrevisti.toString() : "N.D.", color: [80, 80, 80] },
      { label: "Fine produzione effettiva", value: (finalized && finalizedEndDate) ? formatDateDMY(finalizedEndDate) : "N.D.", color: [80, 80, 80] },
    ];

    const rightColumnLines = [
      { label: "Ore totali produzione", value: productionDetails ? productionDetails.reduce((acc, d) => acc + (parseFloat(d.totaleOreGG) || 0), 0).toString() : "0", color: [80, 80, 80] },
      { label: "Minuti a pz", value: (Number(quantita) > 0 ? ((productionDetails ? productionDetails.reduce((acc, d) => acc + (parseFloat(d.totaleOreGG) || 0), 0) : 0) * 60 / Number(quantita)).toFixed(2) : "N.D."), color: [80, 80, 80] },
      { label: "Secondi a pz", value: (Number(quantita) > 0 ? ((productionDetails ? productionDetails.reduce((acc, d) => acc + (parseFloat(d.totaleOreGG) || 0), 0) : 0) * 3600 / Number(quantita)).toFixed(2) : "N.D."), color: [80, 80, 80] },
    ];

    const leftStartY = yPos + ((boxHeight - (leftColumnLines.length * lineHeight)) / 2) + (lineHeight / 2);
    const rightStartY = yPos + ((boxHeight - (rightColumnLines.length * lineHeight)) / 2) + (lineHeight / 2);

    leftColumnLines.forEach((line, index) => {
      doc.setTextColor(...line.color);
      const text = `${line.label}: ${line.value}`;
      doc.text(text, leftColX, leftStartY + index * lineHeight, { align: "left" });
    });

    rightColumnLines.forEach((line, index) => {
      doc.setTextColor(...line.color);
      const text = `${line.label}: ${line.value}`;
      doc.text(text, rightColX, rightStartY + index * lineHeight, { align: "left" });
    });

    yPos += 35;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80, 80, 80);
    doc.text("Dettagli Produzione", 15, yPos);
    yPos += 8;
    doc.setFontSize(10);
    doc.text("Giorno", 15, yPos);
    doc.text("Data", 35, yPos);
    doc.text("Operatori", 70, yPos);
    doc.text("Ore", 105, yPos);
    doc.text("Totale Ore", 135, yPos);
    yPos += 6;
    doc.setFont("helvetica", "normal");
    if (productionDetails && productionDetails.length > 0) {
      productionDetails.forEach(detail => {
        // Sabato rosso e bold
        const [dd, mm, yyyy] = detail.data.split("/");
        const jsDate = new Date(`${yyyy}-${mm}-${dd}`);
        const isSaturday = jsDate.getDay() === 6;
        if (isSaturday) {
          doc.setTextColor(200, 0, 0);
          doc.setFont("helvetica", "bold");
        } else {
          doc.setTextColor(80, 80, 80);
          doc.setFont("helvetica", "normal");
        }
        doc.text(String(detail.giorno), 15, yPos);
        doc.text(detail.data, 35, yPos);
        doc.text(String(detail.numOperatori), 70, yPos);
        doc.text(String(detail.oreImpiegate), 105, yPos);
        doc.text(String(detail.totaleOreGG), 135, yPos);
        yPos += 6;
        if (yPos > 270) {
          doc.addPage();
          yPos = 15;
        }
      });
      doc.setTextColor(80, 80, 80); // Rimetti normale
      doc.setFont("helvetica", "normal");
    } else {
      doc.text("Nessun dettaglio di produzione disponibile.", 15, yPos);
      yPos += 6;
    }

    yPos += 8;
    doc.setLineWidth(0.3);
    doc.setDrawColor(150);
    doc.line(15, yPos, 195, yPos);
    yPos += 10;

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80, 80, 80);
    doc.text("REPORT CONSEGNE", 15, yPos);
    yPos += 10;
    doc.setFontSize(10);
    doc.text("Data", 15, yPos);
    doc.text("Pezzi", 35, yPos);
    doc.text("Bancali", 55, yPos);
    doc.text("Luogo", 80, yPos);
    doc.text("Trasportatore", 110, yPos);
    doc.text("Tipo banc.", 140, yPos);
    doc.text("DDT", 170, yPos);
    yPos += 6;
    doc.setFont("helvetica", "normal");
    if (deliveries && deliveries.length > 0) {
      deliveries.forEach(delivery => {
        const dataDelivery = delivery.date ? formatDateDMY(delivery.date) : "N.D.";
        const totPezzi = delivery.bancali
          ? delivery.bancali.reduce((acc, b) => acc + ((parseInt(b.pzPerBancale) || 0) * (parseInt(b.quantiBancali) || 0)), 0)
          : "-";
        const totBancali = delivery.bancali
          ? delivery.bancali.reduce((acc, b) => acc + (parseInt(b.quantiBancali) || 0), 0)
          : "-";
        const tipoBancale = delivery.bancali
          ? delivery.bancali.map(b => b.tipoDiBancale).join(", ")
          : "-";
        const luogo = delivery.luogo || "-";
        const trasportatore = delivery.trasportatore || "-";
        const ddt = delivery.nddt || "-";
        doc.text(dataDelivery, 15, yPos);
        doc.text(String(totPezzi), 35, yPos);
        doc.text(String(totBancali), 55, yPos);
        doc.text(luogo, 80, yPos);
        doc.text(trasportatore, 110, yPos);
        doc.text(tipoBancale, 140, yPos);
        doc.text(ddt, 170, yPos);
        yPos += 6;
        if (yPos > 270) {
          doc.addPage();
          yPos = 15;
        }
      });
    } else {
      doc.text("Nessuna consegna registrata.", 15, yPos);
      yPos += 6;
    }

    yPos += 15;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(
      "NOTE: Questo report è generato automaticamente dal sistema di gestione produzione di TIME S.r.l.",
      15,
      yPos
    );

    const pdfData = doc.output("datauristring");
    fetch("http://192.168.1.250:3001/api/save-pdf-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderPath, pdfData }),
    })
      .then(res => res.blob())
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "report.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(err => {
        alert("Errore nel salvataggio del report PDF");
      });
  };

  const handleOpenBancaleModal = () => {
    setShowBancaleModal(true);
  };

  const handleSaveBancale = () => {
    if (!pzPerBancale || !codiceProdotto || !tipoDiBancale || !quantiBancali) {
      alert("Per favore completa tutti i campi!");
      return;
    }

    const newBancale = {
      pzPerBancale: parseInt(pzPerBancale, 10),
      codiceProdotto,
      tipoDiBancale,
      quantiBancali: parseInt(quantiBancali, 10)
    };

    setTempBancali([...tempBancali, newBancale]);
    console.log("Nuovo bancale aggiunto:", newBancale);

    setPzPerBancale('');
    setCodiceProdotto('');
    setTipoDiBancale('');
    setQuantiBancali('');
    setShowBancaleModal(false);
  };

  const handleCancelBancale = () => {
    setShowBancaleModal(false);
  };

  const tileContent = ({ date, view }) => {
    if (view !== 'month') return null;
    const tileDate = new Date(date);
    tileDate.setHours(0, 0, 0, 0);
    const elements = [];

    // 1. CONSEGNA SINGOLA (dot verde/rosso)
    if (consegnaDate) {
      const consegna = new Date(consegnaDate);
      consegna.setHours(0, 0, 0, 0);
      if (tileDate.getTime() === consegna.getTime()) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dotColor = consegna.getTime() >= today.getTime() ? '#48BB78' : '#F56565';
        elements.push(
          <div
            key={`consegna-dot-${tileDate.toISOString()}`}
            style={{
              position: 'absolute',
              bottom: 4,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: dotColor,
            }}
          />
        );
      }
    }

    // DICHIARO la variabile mancante!
    const startDateForPlanned =
      lavorazioneStartDate
        ? new Date(lavorazioneStartDate)
        : frozenStartDate
          ? new Date(frozenStartDate)
          : selectedDate
            ? new Date(selectedDate)
            : null;

    // 2. PIANIFICATO (barra verde)
    if (startDateForPlanned && workingDays > 0) {
      const totalPlanned = workingDays;
      const plannedDates = [];
      let current = new Date(startDateForPlanned);
      current.setHours(0, 0, 0, 0);
      while (plannedDates.length < totalPlanned) {
        // qui modifica per includere il sabato
        if (current.getDay() !== 0) {
          plannedDates.push(new Date(current));
        }
        current.setDate(current.getDate() + 1);
      }
      plannedDates.forEach((day, index) => {
        if (tileDate.getTime() === day.getTime()) {
          elements.push(
            <div
              key={`planned-green-${tileDate.toISOString()}-${index}`}
              style={{
                position: 'absolute',
                bottom: 4,
                left: 0,
                width: '100%',
                height: 2,
                background: '#48BB78',
              }}
            />
          );
        }
      });
    }

    // 3. CONSEGNA MULTIPLA (overlay arancione)
    if (deliveries.length > 0 && deliveries.some((d) => isSameDay(new Date(d.date), tileDate))) {
      elements.push(
        <div
          key={`delivery-overlay-${tileDate.toISOString()}`}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: '#FFA500',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 'bold',
            fontSize: '14px',
            zIndex: 2,
          }}
        >
          {tileDate.getDate()}
        </div>
      );
    }

    // 4. PERIODO ROSSO (effettivo produzione)
    if (finalized && reportData && reportData.inizioProduzione && finalizedEndDate) {
      const finalStart = new Date(reportData.inizioProduzione);
      finalStart.setHours(0, 0, 0, 0);
      const finalEnd = new Date(finalizedEndDate);
      finalEnd.setHours(0, 0, 0, 0);
      if (tileDate.getTime() >= finalStart.getTime() && tileDate.getTime() <= finalEnd.getTime()) {
        if (tileDate.getDay() !== 0) { // esclude solo domenica
          elements.push(
            <div
              key={`red-period-${tileDate.toISOString()}`}
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                width: '100%',
                height: 2,
                background: 'red',
              }}
            />
          );
        }
      }
    }

    // 5. INIZIO LAVORAZIONE (dot blu)
    if (lavorazioneStartDate) {
      const lavorazione = new Date(lavorazioneStartDate);
      lavorazione.setHours(0, 0, 0, 0);
      if (tileDate.getTime() === lavorazione.getTime()) {
        elements.push(
          <div
            key={`lavorazione-blue-dot-${tileDate.toISOString()}`}
            style={{
              position: 'absolute',
              bottom: 4,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#4299E1',
            }}
          />
        );
      }
    }

    return elements.length ? <span key={`all-${tileDate.toISOString()}`}>{elements}</span> : null;
  };

  const fixedButtonContainer = "w-32 h-10 flex items-center justify-center";

  const normalActionButtons = (
    <div className="flex space-x-8 mb-4">
      <div className={fixedButtonContainer}>
        {(!reportData || !reportData.inizioProduzione) && selectedDate ? (
          <button
            onClick={handleInizioLavorazione}
            className="px-3 py-1 border-1 border-orange-500 text-green-500 bg-transparent rounded mb-2 shadow-3d whitespace-nowrap transform transition duration-200 hover:scale-105"
          >
            Inizia Lavorazione
          </button>
        ) : reportData && reportData.inizioProduzione ? (
          <button
            onClick={() => { if (window.confirm("Sei sicuro di voler cancellare la lavorazione?")) resetWorkingDays(); }}
            className="px-3 py-1 border-1 border-orange-500 text-red-500 bg-transparent rounded mb-2 shadow-3d whitespace-nowrap transform transition duration-200 hover:scale-105"
          >
            Cancella lavorazione
          </button>
        ) : null}
      </div>
      <div className={fixedButtonContainer}>
        {!finalized && reportData && reportData.inizioProduzione && selectedDate && (
          <button
            onClick={handleFineLavorazione}
            className="px-3 py-1 border-1 border-orange-500 text-green-500 bg-transparent rounded mb-2 shadow-3d whitespace-nowrap transform transition duration-200 hover:scale-105"
          >
            Fine Lavorazione
          </button>
        )}
      </div>
      <div className={fixedButtonContainer}>
        {finalized && (
         <button
  onClick={() => {
    console.log("Apri modale report");
    setShowReportModal(true);
  }}
  className="px-3 py-1 border-1 border-orange-500 text-blue-500 bg-transparent rounded mb-2 shadow-3d whitespace-nowrap transform transition duration-200 hover:scale-105"
>
  Report produzione
</button>

        )}
      </div>
    </div>
  );

  // === INIZIO RETURN ===
  return (
    <div
      ref={nodeRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: '#28282B',
        border: '2px solid #414244',
        borderRadius: 0,
        boxShadow: 'none',
        overflowY: 'auto',
        padding: '20px',
      }}
    >
      <button
        onClick={onClose}
        className="transform transition duration-200 hover:scale-105"
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          backgroundColor: 'red',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          width: '30px',
          height: '30px',
          cursor: 'pointer',
        }}
      >
        X
      </button>

      {/* === Bottone Distinta Materiali === */}
      <div className="mb-4 flex justify-between items-center pr-12">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-white">{nomeCommessa}</h2>
          <button
            onClick={() => setShowMaterialiModal(true)}
            className="px-3 py-1 border-2 border-blue-500 text-blue-500 bg-white rounded shadow-3d whitespace-nowrap transform transition duration-200 hover:scale-105"
          >
            Distinta Materiali
          </button>
        </div>
        <span className="text-lg font-bold text-white">
          {`Q.tà ${(quantita == null || quantita === "") ? "N.d." : quantita}`}
        </span>
      </div>



      <div
        ref={calendarContainerRef}
        className="border-2 border-custom rounded-lg p-4 mb-8 shadow-3d"
      >
        <Calendar
          onClickDay={archiviata ? undefined : onClickDay}
          tileContent={tileContent}
          value={selectedDate ? new Date(selectedDate) : null}
          className="w-full"
        />
      </div>

      <div className="grid grid-cols-2 gap-4" style={{ minHeight: '250px' }}>
        <div className="border-2 border-custom shadow-3d rounded-lg p-4 flex flex-col justify-start items-start h-full">
          <h3 className="text-lg font-bold text-white mb-4">Report Produzione</h3>
          {!archiviata && normalActionButtons}
          {reportData && reportData.inizioProduzione && (
            <>
              <p className={finalized ? "text-red-500" : "text-green-500"}>
                Inizio produzione: <b>{formatDateDMY(reportData.inizioProduzione)}</b>
              </p>
              <p className="text-green-500">
                Fine prod. prevista: <b>{formatDateDMY(reportData.fineProduzionePrevista)}</b>
              </p>
              <p className="text-green-500">
                Giorni lav. previsti: <b>{reportData.totGiorniLavorativiPrevisti || 0}</b>
              </p>
            </>
          )}
          {finalized && (
            <div className="mt-2 border-t pt-4">
              <p className="text-red-500">
                Fine produzione: <b>{formatDateDMY(finalizedEndDate)}</b>
              </p>
              <h4 className="text-lg font-bold text-blue-500">Tempi di produzione</h4>
              <p className="mt-2 text-blue-500">
                Ore totali produzione: <b>{productionDetails.reduce((acc, d) => acc + (parseFloat(d.totaleOreGG) || 0), 0)}</b>
              </p>
              <p className="text-blue-500">
                Minuti a pz: <b>
                  {quantita && Number(quantita) > 0
                    ? ((productionDetails.reduce((acc, d) => acc + (parseFloat(d.totaleOreGG) || 0), 0) * 60) / Number(quantita)).toFixed(2)
                    : "N.D."}
                </b>
              </p>
              <p className="text-blue-500">
                Secondi a pz: <b>
                  {quantita && Number(quantita) > 0
                    ? ((productionDetails.reduce((acc, d) => acc + (parseFloat(d.totaleOreGG) || 0), 0) * 3600) / Number(quantita)).toFixed(2)
                    : "N.D."}
                </b>
              </p>
              {productionDetails.length > 0 && (
                <div className="mt-4 max-h-[120px] overflow-y-auto">
  <h4 className="text-lg font-bold text-blue-500 mb-2">Dettagli Produzione</h4>
  <table className="w-full border-collapse">
    <thead>
      <tr>
        <th className="border p-2 text-blue-500">Giorno</th>
        <th className="border p-2 text-blue-500">Data</th>
        <th className="border p-2 text-blue-500">Num. Operatori</th>
        <th className="border p-2 text-blue-500">Ore impiegate</th>
        <th className="border p-2 text-blue-500">Totale ore</th>
      </tr>
    </thead>
    <tbody>
      {productionDetails.map((detail, index) => (
        <tr key={index}>
          <td className="border p-2 text-blue-500 text-center">{detail.giorno}</td>
          <td className="border p-2 text-blue-500 text-center">{detail.data}</td>
          <td className="border p-2 text-blue-500 text-center">{detail.numOperatori}</td>
          <td className="border p-2 text-blue-500 text-center">{detail.oreImpiegate}</td>
          <td className="border p-2 text-blue-500 text-center">{detail.totaleOreGG}</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>

              )}
            </div>
          )}
        </div>
        <div className="border-2 border-custom shadow-3d rounded-lg p-4 flex flex-col justify-start items-start h-full">
          <div className="w-full flex flex-wrap items-end justify-between gap-4 mb-4">
  <h3 className="text-lg font-bold text-white">Report Consegne</h3>

  <div className="flex items-end gap-3">
    <div className="text-right mr-6">
      <p className="text-lg font-bold text-white">Pezzi a saldo: {saldo}</p>
      <p className="text-lg font-bold text-white">Pezzi consegnati: {totPezziConsegna}</p>
    </div>

    <div>
      <label className="block text-sm font-medium text-gray-700">Prezzo vendita (€/pz)</label>
      <input
        type="number"
        step="0.0001"
        value={prezzoVendita}
        onChange={(e) => setPrezzoVendita(e.target.value)}
        className="border rounded px-2 py-1"
        placeholder="es. 1.2345"
        style={{ minWidth: 160 }}
      />
    </div>
    <button
      type="button"
      onClick={savePrezzoVendita}
      className="px-3 py-1 bg-blue-600 text-white rounded hover:scale-105 transition"
      title="Salva prezzo vendita su report.json"
    >
      Salva
    </button>
  </div>
</div>


          {selectedDate && (
            <button
              onClick={handleInsertDeliveryClick}
              className="px-3 py-1 border-1 border-orange-500 text-orange-500 bg-transparent rounded mb-2 shadow-3d transform transition duration-200 hover:scale-105"
            >
              Inserisci consegna
            </button>
          )}
          {deliveries.length > 0 && (
            <ul className="text-sm text-orange-500 w-full">
              {deliveries.map((delivery, idx) => {
                const totPezziDelivery = delivery.bancali
                  ? delivery.bancali.reduce((acc, b) => acc + (b.pzPerBancale * b.quantiBancali), 0)
                  : 0;
                const totBancaliDelivery = delivery.bancali
                  ? delivery.bancali.reduce((acc, b) => acc + b.quantiBancali, 0)
                  : 0;
                return (
                  <li key={idx} className="mb-1 flex items-center w-full">
                    <div>
                      {formatDateDMY(delivery.date)} - <strong>Tot. pezzi:</strong> {totPezziDelivery} - <strong>Tot. bancali:</strong> {totBancaliDelivery} - <strong>Luogo:</strong> {delivery.luogo}, <strong>Trasportatore:</strong> {delivery.trasportatore}, <strong>N° DDT:</strong> {delivery.nddt}
                    </div>
                    <div className="ml-auto flex space-x-4">
                      <button
                        onClick={() => handleEditDelivery(idx)}
                        className="px-3 py-1 border-2 border-orange-500 text-white bg-transparent rounded shadow-3d transform transition duration-200 hover:scale-105"
                      >
                        Modifica
                      </button>
                      <button
                        onClick={() => handleDeleteDelivery(idx)}
                        className="text-red-500 underline text-xs transform transition duration-200 hover:scale-105"
                      >
                        Cancella
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Bottone per archiviare la commessa (solo dopo fine lavorazione) */}
      {!archiviata && finalized && (
        <div className="sticky bottom-0 flex justify-center mt-4 space-x-4 bg-transparent p-2 z-20">
          <button
            onClick={handleCloseCommessa}
            className="px-3 py-1 border-1 border-orange-500 text-black bg-white rounded shadow-3d transform transition duration-200 hover:scale-105"
          >
            Archivia Commessa
          </button>
        </div>
      )}

      {/* Bottone per generare il PDF, visibile se la commessa è archiviata */}
      {archiviata && (
        <div className="sticky bottom-0 flex justify-center mt-4 space-x-4 bg-transparent p-2 z-20">
          <button
            onClick={handleGeneratePDFReport}
            className="px-3 py-1 border-1 border-orange-500 text-white bg-gray-500 rounded shadow-3d transform transition duration-200 hover:scale-105"
          >
            Genera PDF
          </button>
        </div>
      )}

      {/* Modal per la consegna */}
      {showDeliveryModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-800 bg-opacity-75 z-50">
          <div className="bg-white p-6 rounded-lg w-[48rem] h-[48rem] flex flex-col">
            <h3 className="text-2xl font-bold mb-4">
              {deliveryEditIndex !== null ? "Modifica Consegna" : "Inserisci Consegna"}
            </h3>
            <button
              onClick={handleOpenBancaleModal}
              className="flex items-center space-x-2 px-3 py-1 border-2 border-orange-500 text-green-500 bg-transparent rounded mb-4 shadow-3d transform transition duration-200 hover:scale-105"
            >
              <span className="flex items-center justify-center w-6 h-6 rounded-full border border-green-500">
                +
              </span>
              <span>Aggiungi bancale</span>
            </button>

            {tempBancali.length > 0 && (
              <div className="mb-4">
                <h4 className="font-bold mb-2">Bancali Aggiunti:</h4>
                {tempBancali.map((bancale, index) => (
                  <div
                    key={index}
                    className="border p-2 mb-2 flex items-center justify-between"
                  >
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-black rounded-full mr-2"></div>
                      <p className="text-sm">
                        Pz per bancale: <strong>{bancale.pzPerBancale}</strong> -{" "}
                        Q.tà Bancali: <strong>{bancale.quantiBancali}</strong> -{" "}
                        Codice: <strong>{bancale.codiceProdotto}</strong> -{" "}
                        Tipo di bancale: <strong>{bancale.tipoDiBancale}</strong>
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEditBancale(index)}
                        className="px-2 py-1 text-xs border rounded transform transition duration-200 hover:scale-105"
                      >
                        Mod
                      </button>
                      <button
                        onClick={() => handleDeleteBancale(index)}
                        className="px-2 py-1 text-xs border rounded transform transition duration-200 hover:scale-105 text-red-500"
                      >
                        Canc
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-auto">
              <div className="mb-2">
                <label className="block text-green-500 font-medium">Tot. pezzi</label>
                <input
                  type="text"
                  value={totPezzi}
                  readOnly
                  className="w-full border rounded px-2 py-1 bg-gray-100"
                />
              </div>
              <div className="mb-2">
                <label className="block text-green-500 font-medium">Tot. bancali</label>
                <input
                  type="text"
                  value={totBancali}
                  readOnly
                  className="w-full border rounded px-2 py-1 bg-gray-100"
                />
              </div>
              <div className="mb-2">
                <label className="block text-sm font-medium">Luogo consegna</label>
                <input
                  type="text"
                  value={deliveryLuogo}
                  onChange={(e) => setDeliveryLuogo(e.target.value)}
                  className="w-full border rounded px-2 py-1"
                  placeholder="Inserisci il luogo di consegna"
                />
              </div>
              <div className="mb-2">
                <label className="block text-sm font-medium">Trasportatore</label>
                <input
                  type="text"
                  value={deliveryTrasportatore}
                  onChange={(e) => setDeliveryTrasportatore(e.target.value)}
                  className="w-full border rounded px-2 py-1"
                  placeholder="Inserisci il trasportatore"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium">N° DDT</label>
                <input
                  type="text"
                  value={deliveryNddt}
                  onChange={(e) => setDeliveryNddt(e.target.value)}
                  className="w-full border rounded px-2 py-1"
                  placeholder="Inserisci il numero DDT"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowDeliveryModal(false);
                    setDeliveryEditIndex(null);
                  }}
                  className="px-3 py-1 border rounded transform transition duration-200 hover:scale-105"
                >
                  Annulla
                </button>
                <button
                  onClick={handleSaveDelivery}
                  className="px-3 py-1 bg-green-500 text-white rounded transform transition duration-200 hover:scale-105"
                >
                  {deliveryEditIndex !== null ? "Salva Modifica" : "Salva Consegna"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal per inserimento giorni lavorativi */}
      {showWorkingDaysModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-800 bg-opacity-75 z-50">
          <div className="bg-white p-4 rounded-lg">
            <h3 className="text-lg font-bold mb-4">Inserisci Giorni Lavorativi Previsti</h3>
            <input
              type="number"
              value={tempWorkingDays}
              onChange={(e) => setTempWorkingDays(e.target.value)}
              className="border rounded px-2 py-1"
              placeholder="Numero di giorni"
            />
            <div className="flex justify-end mt-4">
              <button
                onClick={() => setShowWorkingDaysModal(false)}
                className="mr-2 px-3 py-1 border rounded transform transition duration-200 hover:scale-105"
              >
                Annulla
              </button>
              {tempWorkingDays && parseInt(tempWorkingDays, 10) > 0 && (
                <button
                  onClick={handleWorkingDaysSave}
                  className="px-3 py-1 bg-green-500 text-white rounded transform transition duration-200 hover:scale-105"
                >
                  OK
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal per conferma fine lavorazione */}
      {showFineModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-800 bg-opacity-75 z-50">
          <div className="bg-white p-6 rounded-lg">
            <h3 className="text-xl font-bold mb-4">Conferma Fine Lavorazione</h3>
            <p className="mb-4">
              Confermi la fine della lavorazione per il giorno <b>{selectedDate ? formatDateDMY(selectedDate) : "N.D."}</b>?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowFineModal(false)}
                className="px-3 py-1 border rounded transform transition duration-200 hover:scale-105"
              >
                Annulla
              </button>
              <button
                onClick={confirmFineLavorazione}
                className="px-3 py-1 bg-green-500 text-white rounded transform transition duration-200 hover:scale-105"
              >
                Conferma
              </button>
            </div>
          </div>
        </div>
      )}

     {/* Modal dettagli produzione */}
{showProductionDetailsModal && (
  <div className="fixed inset-0 flex items-center justify-center bg-gray-800 bg-opacity-75 z-50">
    <div className="bg-white p-6 rounded-lg max-h-full overflow-y-auto w-[700px]">
      <h3 className="text-xl font-bold mb-4">Dettagli produzione</h3>

      {/* Riepilogo ore, minuti e min a pz */}
      <div className="mb-4 flex justify-start space-x-8">
        <div>
          <span className="font-semibold">Tot Ore:</span>{" "}
          <span>{productionDetails.reduce((acc, d) => acc + (parseFloat(d.totaleOreGG) || 0), 0).toFixed(2)}</span>
        </div>
        <div>
          <span className="font-semibold">Tot Minuti:</span>{" "}
          <span>{(productionDetails.reduce((acc, d) => acc + (parseFloat(d.totaleOreGG) || 0), 0) * 60).toFixed(2)}</span>
        </div>
        <div>
          <span className="font-semibold">Min a pz:</span>{" "}
          <span>
            {quantita && Number(quantita) > 0
              ? ((productionDetails.reduce((acc, d) => acc + (parseFloat(d.totaleOreGG) || 0), 0) * 60) / Number(quantita)).toFixed(2)
              : "N.D."}
          </span>
        </div>
      </div>

      {productionDetails.map((detail, index) => {
        const [dd, mm, yyyy] = detail.data.split("/");
        const jsDate = new Date(`${yyyy}-${mm}-${dd}`);
        const isSaturday = jsDate.getDay() === 6;

        const operatoriFilled = detail.numOperatori !== '' && detail.numOperatori !== undefined;
        const oreFilled = detail.oreImpiegate !== '' && detail.oreImpiegate !== undefined;

        return (
          <div
            key={index}
            className="mb-4 border p-2 rounded transform transition duration-200 hover:scale-105"
            style={isSaturday ? { color: 'red', fontWeight: 'bold' } : {}}
            title={isSaturday ? 'Sabato lavorativo' : ''}
          >
            <p className="mb-1 font-semibold">Giorno {detail.giorno} - {detail.data}</p>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-sm">Num. Operatori</label>
                <input
                  type="number"
                  value={detail.numOperatori}
                  onChange={(e) => handleProductionDetailsChange(index, 'numOperatori', e.target.value)}
                  className={`w-full border rounded px-2 py-1 ${operatoriFilled ? 'bg-blue-200' : 'bg-white'}`}
                  placeholder="Operatori"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm">Ore impiegate</label>
                <input
                  type="number"
                  value={detail.oreImpiegate}
                  onChange={(e) => handleProductionDetailsChange(index, 'oreImpiegate', e.target.value)}
                  className={`w-full border rounded px-2 py-1 ${oreFilled ? 'bg-blue-200' : 'bg-white'}`}
                  placeholder="Ore"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm">Totale ore GG</label>
                <input
                  type="number"
                  value={detail.totaleOreGG}
                  readOnly
                  className="w-full border rounded px-2 py-1 bg-gray-100"
                />
              </div>
            </div>
          </div>
        );
      })}

      <div className="flex justify-end gap-3">
        <button
          onClick={() => setShowProductionDetailsModal(false)}
          className="px-3 py-1 border rounded transform transition duration-200 hover:scale-105"
        >
          Annulla
        </button>
        {allFieldsFilled && (
          <button
            onClick={saveProductionDetails}
            className="px-3 py-1 bg-green-500 text-white rounded transform transition duration-200 hover:scale-105"
          >
            Salva Dettagli
          </button>
        )}
      </div>
    </div>
  </div>
)}

{/* Modal report produzione */}
{showReportModal && (
  <div className="fixed inset-0 flex items-center justify-center bg-gray-800 bg-opacity-75 z-50">
    <div className="bg-white p-6 rounded-lg max-h-full overflow-y-auto w-[700px]">
      <h3 className="text-xl font-bold text-gray-500 mb-4">Report Produzione</h3>

      {reportData && reportData.inizioProduzione && (
        <>
          <p className={finalized ? "text-red-500" : "text-black"}>
            Inizio produzione: <b>{formatDateDMY(reportData.inizioProduzione)}</b>
          </p>
          <p className="text-green-500">
            Fine prod. prevista: <b>{formatDateDMY(reportData.fineProduzionePrevista)}</b>
          </p>
          <p className="text-green-500">
            Giorni lav. previsti: <b>{reportData.totGiorniLavorativiPrevisti || 0}</b>
          </p>
        </>
      )}

      {finalized && (
        <div className="mt-2 border-t pt-4">
          <p className="text-red-500">
            Fine produzione: <b>{formatDateDMY(finalizedEndDate)}</b>
          </p>
          <h4 className="text-lg font-bold text-blue-500">Tempi di produzione</h4>
          <p className="mt-2 text-blue-500">
            Ore totali produzione: <b>{productionDetails.reduce((acc, d) => acc + (parseFloat(d.totaleOreGG) || 0), 0)}</b>
          </p>
          <p className="text-blue-500">
            Minuti a pz: <b>
              {quantita && Number(quantita) > 0
                ? ((productionDetails.reduce((acc, d) => acc + (parseFloat(d.totaleOreGG) || 0), 0) * 60) / Number(quantita)).toFixed(2)
                : "N.D."}
            </b>
          </p>
          <p className="text-blue-500">
            Secondi a pz: <b>
              {quantita && Number(quantita) > 0
                ? ((productionDetails.reduce((acc, d) => acc + (parseFloat(d.totaleOreGG) || 0), 0) * 3600) / Number(quantita)).toFixed(2)
                : "N.D."}
            </b>
          </p>
          {productionDetails.length > 0 && (
            <div className="mt-4 max-h-[120px] overflow-y-auto">
  <h4 className="text-lg font-bold text-blue-500 mb-2">Dettagli Produzione</h4>
  <table className="w-full border-collapse">
    <thead>
      <tr>
        <th className="border p-2 text-blue-500">Giorno</th>
        <th className="border p-2 text-blue-500">Data</th>
        <th className="border p-2 text-blue-500">Num. Operatori</th>
        <th className="border p-2 text-blue-500">Ore impiegate</th>
        <th className="border p-2 text-blue-500">Totale ore</th>
      </tr>
    </thead>
    <tbody>
      {productionDetails && productionDetails.length > 0 ? (
        productionDetails.map((detail, idx) => (
          <tr key={idx}>
            <td className="border p-2 text-blue-500 text-center">{detail.giorno}</td>
            <td className="border p-2 text-blue-500 text-center">{detail.data}</td>
            <td className="border p-2 text-blue-500 text-center">{detail.numOperatori}</td>
            <td className="border p-2 text-blue-500 text-center">{detail.oreImpiegate}</td>
            <td className="border p-2 text-blue-500 text-center">{detail.totaleOreGG}</td>
          </tr>
        ))
      ) : (
        <tr>
          <td colSpan={5} className="text-center text-gray-400">Nessun dettaglio di produzione disponibile.</td>
        </tr>
      )}
    </tbody>
  </table>
</div>

          )}
        </div>
      )}

      <div className="flex justify-end gap-4 mt-4">
        <button
          onClick={() => setShowReportModal(false)}
          className="px-3 py-1 border-1 border-orange-500 text-white bg-gray-500 rounded mb-2 shadow-3d transform transition duration-200 hover:scale-105"
        >
          Chiudi
        </button>
        <button
 onClick={() => {
  const destinatario = emailDestinatariLavorazione || "";
  const subject = `Report Produzione : ${nomeCommessa}`;

  // Primo tentativo: body con tutti i dettagli
  let emailBody = buildEmailBody(false);

  // Se troppo lunga, riprova SENZA dettagli produzione
  if (emailBody.length > 1800) {
    alert("Il report dettagliato è troppo lungo, verrà inviato senza i dettagli produzione. Puoi allegarli a parte!");
    emailBody = buildEmailBody(true);
  }

  const mailto = `mailto:${encodeURIComponent(destinatario)}?subject=${encodeURIComponent(subject)}&body=${emailBody}`;
  window.location.href = mailto;
}}

  className="px-3 py-1 border-1 border-orange-500 text-white bg-gray-500 rounded mb-2 shadow-3d transform transition duration-200 hover:scale-105"
>
  Inoltra
</button>

      </div>
    </div>
  </div>
)}

{showBancaleModal && (
  <div className="fixed inset-0 flex items-center justify-center bg-gray-800 bg-opacity-75 z-50 transition-all duration-300">
    <div className="bg-white p-6 rounded-lg w-96">
      <h3 className="text-xl font-bold mb-4">Aggiungi Bancale</h3>
      <div className="mb-4">
        <label className="block text-sm font-medium">Pz. per bancale</label>
        <input
          type="number"
          value={pzPerBancale}
          onChange={(e) => setPzPerBancale(e.target.value)}
          className="w-full border rounded px-2 py-1"
          placeholder="Inserisci Pz. per bancale"
        />
      </div>
      <div className="mb-4">
        <label className="block text-sm font-medium">Codice prodotto</label>
        <input
          type="text"
          value={codiceProdotto}
          onChange={(e) => setCodiceProdotto(e.target.value)}
          className="w-full border rounded px-2 py-1"
          placeholder="Inserisci Codice prodotto"
        />
      </div>
      <div className="mb-4">
        <label className="block text-sm font-medium">Tipo di bancale</label>
        <input
          type="text"
          value={tipoDiBancale}
          onChange={(e) => setTipoDiBancale(e.target.value)}
          className="w-full border rounded px-2 py-1"
          placeholder="Inserisci Tipo di bancale"
        />
      </div>
      <div className="mb-4">
        <label className="block text-sm font-medium">Quanti bancali di questo tipo</label>
        <input
          type="number"
          value={quantiBancali}
          onChange={(e) => setQuantiBancali(e.target.value)}
          className="w-full border rounded px-2 py-1"
          placeholder="Inserisci quantità"
        />
      </div>
      <div className="flex justify-end gap-3">
        <button
          onClick={handleCancelBancale}
          className="px-3 py-1 border rounded transform transition duration-200 hover:scale-105"
        >
          Annulla
        </button>
        <button
          onClick={handleSaveBancale}
          className="px-3 py-1 bg-green-500 text-white rounded transform transition duration-200 hover:scale-105"
        >
          Salva
        </button>
      </div>
    </div>
  </div>
)}

{showMaterialiModal && (
  <div
    className="fixed inset-0 z-50 bg-black bg-opacity-80 flex items-center justify-center"
    style={{
      width: "100vw",
      height: "100vh",
      top: 0,
      left: 0,
      overflow: "hidden",
      padding: 0,
      margin: 0,
    }}
  >
    <div
      className="bg-white shadow-xl flex flex-col"
      style={{
        width: "100vw",
        height: "100vh",
        maxWidth: "100vw",
        maxHeight: "100vh",
        borderRadius: 0,
        overflow: "auto",
        padding: "36px 48px 32px 48px",
        position: "relative",
      }}
    >
      {/* BOTTONE CHIUDI IN ALTO A DESTRA */}
      <button
        onClick={() => setShowMaterialiModal(false)}
        className="absolute top-4 right-8 px-3 py-1 bg-red-500 text-white rounded font-bold z-10"
        style={{ fontSize: "1.1rem" }}
      >
        Chiudi
      </button>
      <h3 className="text-2xl font-bold mb-4" style={{ marginTop: 0 }}>
        Distinta Materiali
      </h3>
      {/* Form di filtro */}
      <form onSubmit={handleCercaMateriali} className="flex flex-wrap items-center gap-4 mb-5">
        <div>
          <label className="font-medium mr-2">Commessa:</label>
          <input
            type="text"
            value={filtroSottocommessa}
            onChange={e => setFiltroSottocommessa(e.target.value)}
            className="border px-2 py-1 rounded"
            style={{ width: 160 }}
          />
        </div>
        <div>
          <label className="font-medium mr-2">Cliente/Fornitore:</label>
          <select
            value={filtroTipoCF}
            onChange={e => setFiltroTipoCF(e.target.value)}
            className="border px-2 py-1 rounded"
          >
            <option value="">Tutti</option>
            <option value="cliente">Clienti</option>
            <option value="fornitore">Fornitori</option>
          </select>
        </div>
        <label className="flex items-center font-medium cursor-pointer">
          <input
            type="checkbox"
            checked={filtroQtaMaggioreZero}
            onChange={e => setFiltroQtaMaggioreZero(e.target.checked)}
            className="mr-2"
          />
          Solo quantità &gt; 0
        </label>
        <button
          type="submit"
          className="px-3 py-1 bg-blue-500 text-white rounded hover:scale-105 transition"
        >
          Cerca
        </button>
        <button
          type="button"
          className="px-3 py-1 ml-3 bg-green-500 text-white rounded hover:scale-105 transition font-bold"
          onClick={handleExportExcel}
        >
          Excel
        </button>
        <button
          type="button"
          className="px-3 py-1 bg-orange-500 text-white rounded hover:scale-105 transition ml-2"
          onClick={() => setShowBollaForm(true)}
        >
          Bolla Uscita
        </button>
<button
    type="button"
    className="px-3 py-1 bg-violet-600 text-white rounded hover:scale-105 transition ml-2"
    onClick={() => setShowBollaFormEntrata(true)}
  >
    Bolla Entrata
  </button>
      </form>
      {/* Tabella materiali */}
      <div
        className="flex-1"
        style={{
          overflow: "auto",
          minHeight: 0,
        }}
      >
        {caricamentoMateriali ? (
          <div className="text-center text-gray-500 mt-10">Caricamento...</div>
        ) : materialiTab.length > 0 ? (
          <table className="w-full border-collapse">
            <thead>
  <tr>
    <th className="border p-2">Cliente/Fornitore</th>
    <th className="border p-2">Articolo</th>
    <th className="border p-2">Qta</th>
    <th className="border p-2">Descrizione</th>
    <th className="border p-2">Note</th>
    <th className="border p-2">Prezzo Unit.</th>
    <th className="border p-2">Data Consegna</th>
  </tr>
</thead>
<tbody>
  {materialiTab.map((row, idx) => (
    <tr key={idx}>
      <td className="border p-2">{row.ClienteFornitore}</td>
      <td className="border p-2">{row.Cd_AR}</td>
      <td className="border p-2 text-right">{Number(row.Qta).toFixed(2)}</td>
      <td className="border p-2">{row.Descrizione}</td>
      <td className="border p-2">{row.NoteRiga || ""}</td>
      <td className="border p-2 text-right">{Number(row.PrezzoUnitarioV).toFixed(4)}</td>
      <td className="border p-2">{row.DataConsegna}</td>
    </tr>
  ))}
</tbody>


          </table>
        ) : (
          <div className="text-center text-gray-500 mt-8">
            Nessun risultato trovato per questi filtri.
          </div>
        )}
      </div>
    </div>
  </div>
)}

{/* MODALE BOLLA USCITA */}
{showBollaForm && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-800 bg-opacity-80">
    <BollaFormUscita
      commessa={commessaMemo}
      onClose={() => setShowBollaForm(false)}
    />
  </div>
)}
{showBollaFormEntrata && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-800 bg-opacity-80">
    <BollaFormEntrata
      commessa={commessaMemo}
      onClose={() => setShowBollaFormEntrata(false)}
reportDdtPath={reportDdtPath} 
    />
  </div>
)}

</div>
  );
}



