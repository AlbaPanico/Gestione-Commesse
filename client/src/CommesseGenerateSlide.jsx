import React, { useState, useEffect } from 'react';
import { Search, Folder, Check, X } from 'lucide-react';
import { Input } from './components/ui/input';

// Triangolino blu per stato "acquisita"
const BlueTriangle = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16">
    <polygon points="8,3 15,14 1,14" fill="#4299E1" />
  </svg>
);


export function getCommessaStatus(commessa) {
  if (commessa.archiviata) return "archiviata";
  if (commessa.inizioProduzione && commessa.inizioProduzione !== "") return "inAssemblaggio";
  if (commessa.dataConsegna) {
    const deliveryDate = new Date(commessa.dataConsegna);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    deliveryDate.setHours(0, 0, 0, 0);
    return deliveryDate < today ? "scaduta" : "acquisita";
  }
  return "undefined";
}

function getStatusDot(commessa) {
  // 1) Se archiviata: torna subito il pallino arancione, senza controllare altro
  if (commessa.archiviata === true || commessa.archiviata === "true") {
    return (
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#ed8936", // arancione (Tailwind orange-400)
          display: "inline-block",
          marginRight: 8,
        }}
        title="Archiviata"
      ></span>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let commessaDate = null;
  if (commessa.dataConsegna) {
    if (commessa.dataConsegna.includes('-')) {
      commessaDate = new Date(commessa.dataConsegna);
    } else if (commessa.dataConsegna.includes('/')) {
      const [day, month, year] = commessa.dataConsegna.split('/');
      commessaDate = new Date(year, month - 1, day);
    }
  }
  if (!commessaDate) return null;

  // Poi continui con gli altri controlli:
  if (
    commessaDate < today &&
    commessa.inizioProduzione &&
    !commessa.fineProduzioneEffettiva
  ) {
    return (
      <span
        className="blinking"
        style={{
          display: "inline-block",
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "#F56565",
          border: "2px solid #48BB78",
          marginRight: 8,
        }}
        title="In produzione ma scaduta"
      ></span>
    );
  }

  if (commessa.fineProduzioneEffettiva && !commessa.archiviata) {
    return (
      <span
        className="blinking"
        style={{
          color: "#F56565",
          fontWeight: "bold",
          fontSize: "36px",
          lineHeight: "20px",
          width: 24,
          height: 24,
          display: "inline-block",
          textAlign: "center",
          verticalAlign: "middle",
          marginRight: 8,
        }}
        title="Produzione finita ma non archiviata"
      >
        ×
      </span>
    );
  }

  if (commessaDate < today) {
    return (
      <span
        className="blinking"
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#F56565",
          display: "inline-block",
          marginRight: 8,
        }}
        title="Scaduta"
      ></span>
    );
  }

  if (commessa.inizioProduzione && commessaDate >= today) {
    return (
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#48BB78",
          display: "inline-block",
          marginRight: 8,
        }}
        title="In produzione"
      ></span>
    );
  }

 return (
  <span style={{ display: "inline-block", marginRight: 8 }} title="Acquisita">
    <BlueTriangle size={16} />
  </span>
);

}



export default function CommesseGenerateSlide({ 
  commesse, 
  searchQuery, 
  setSearchQuery, 
  sortCriteria, 
  setSortCriteria, 
  handleEditCommessa,
  onSelectDate,
  onOpenCalendar,  
  archiviaCommessa,
}) {
  // Stato dummy per forzare il re-render ogni minuto
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const intervalId = setInterval(() => {
      setTick(prev => prev + 1);
    }, 5000);
    return () => clearInterval(intervalId);
  }, []);

  // Verifica se la commessa ha tutti i campi compilati
  const isCommessaComplete = (commessa) => {
    const productName = commessa.nomeProdotto || commessa.nome;
    return (
      !!commessa.cliente && commessa.cliente.trim() !== "" &&
      !!commessa.brand && commessa.brand.trim() !== "" &&
      !!productName && productName.trim() !== "" &&
      !!commessa.quantita && Number(commessa.quantita) > 0 &&
      !!commessa.codiceProgetto && commessa.codiceProgetto.trim() !== "" &&
      !!commessa.codiceCommessa && commessa.codiceCommessa.trim() !== "" &&
      !!commessa.dataConsegna && commessa.dataConsegna.trim() !== ""
    );
  };

  // Determina lo status della commessa (per tooltip e filtri “Scaduta”/“Acquisita”)
  const getCommessaStatus = (commessa) => {
    if (commessa.archiviata) return "archiviata";
    if (commessa.inizioProduzione && commessa.inizioProduzione !== "") return "inAssemblaggio";
    if (commessa.dataConsegna) {
      const deliveryDate = new Date(commessa.dataConsegna);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      deliveryDate.setHours(0, 0, 0, 0);
      return deliveryDate < today ? "scaduta" : "acquisita";
    }
    return "undefined";
  };

 

  // Filtro e ordinamento delle commesse
  const query = searchQuery.trim().toLowerCase();
  let visibleCommesse;
  if (query !== "") {
    visibleCommesse = commesse.filter(commessa => (
      (commessa.nome || '').toLowerCase().includes(query) ||
      (commessa.cliente || '').toLowerCase().includes(query) ||
      (commessa.brand || '').toLowerCase().includes(query) ||
      (commessa.codiceProgetto || '').toLowerCase().includes(query) ||
      (commessa.codiceCommessa || '').toLowerCase().includes(query)
    ));
  } else {
    visibleCommesse = commesse.filter(commessa => {
      const status = getCommessaStatus(commessa);
      switch (sortCriteria) {
        case "archiviata":
          return commessa.archiviata === true;
        case "produzioneFinita":
          return commessa.fineProduzioneEffettiva && !commessa.archiviata;
        case "inAssemblaggio":
          return commessa.inizioProduzione && !commessa.fineProduzioneEffettiva && !commessa.archiviata;
        case "scaduta":
          return status === "scaduta" && !commessa.archiviata;
        case "acquisita":
          return status === "acquisita" && !commessa.archiviata;
        case "dataConsegna":
          return commessa.dataConsegna && commessa.dataConsegna.trim() !== "" && !commessa.archiviata;
        case "brand":
          return true;
        default:
          return true;
      }
    });

    visibleCommesse.sort((a, b) => {
      if (sortCriteria === "dataConsegna" && a.dataConsegna && b.dataConsegna) {
        return new Date(a.dataConsegna) - new Date(b.dataConsegna);
      }
      if (sortCriteria === "brand") {
        return (a.brand || "").localeCompare(b.brand || "");
      }
      return 0;
    });
  }

  // Copia testo negli appunti
  const copyToClipboard = (text) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => alert("Testo copiato correttamente!"))
        .catch(err => {
          console.error("Errore copiando il testo:", err);
          alert("Errore nel copiare il testo.");
        });
    } else {
      const tempInput = document.createElement("input");
      tempInput.value = text;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand("copy");
      document.body.removeChild(tempInput);
      alert("Testo copiato!");
    }
  };

  return (
    <div 
      className="fixed top-4 left-4 w-1/4 bg-white shadow-md p-4 relative rounded-lg border-t border-b border-gray-300 z-50"
      style={{
        overflow: "visible",
        boxShadow: "0 4px 8px rgba(128,128,128,0.5)",
        height: "calc(100vh - 2rem)"
      }}
    >
      <div className="mb-4">
        <h2 className="text-lg font-bold text-blue-900 mb-2">Lista Commesse</h2>
        <div className="relative mb-4">
          <Input
            type="text"
            placeholder="Cerca commessa..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && console.log("Ricerca effettuata per:", searchQuery)}
            className="w-full pl-10 pr-10"
          />
          <Search className="absolute top-1/2 left-3 transform -translate-y-1/2 text-gray-400" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              title="Reset campo ricerca"
              className="absolute top-1/2 right-3 transform -translate-y-1/2 hover:scale-105"
            >
              <X size={18} className="text-gray-500" />
            </button>
          )}
        </div>

        {/* → select riordinato e titoli descrittivi ← */}
        <select
          value={sortCriteria || ""}
          onChange={e => setSortCriteria(e.target.value)}
          className="border rounded p-2 transform transition duration-200 hover:scale-105"
        >
          <option value="" title="Mostra tutte le commesse">Tutte le commesse</option>
          <option value="dataConsegna" title="Ordina per Data Consegna">Ordina per Data Consegna</option>
          <option value="archiviata" title="Arancione – Archiviate">Archiviate</option>
          <option value="produzioneFinita" title="Outline verde – Produzione finita">Produzione finita</option>
          <option value="inAssemblaggio" title="Verde pieno – In lavorazione">In lavorazione</option>
          <option value="scaduta" title="Rosso – Scadute">Scadute</option>
          <option value="acquisita" title="Blu – Acquisite">Acquisite</option>
        </select>
      </div>
      
      <div style={{ overflowY: "auto", maxHeight: "calc(100% - 150px)" }}>
        <ul>
          {visibleCommesse.map((commessa, index) => {
            const productName = commessa.nomeProdotto || commessa.nome;
            const complete = isCommessaComplete(commessa);
            <span>{getStatusDot(commessa)}</span>


            const statusKey = getCommessaStatus(commessa);
            const statusLabels = {
              produzioneFinita: 'Produzione finita',
              archiviata:       'Archiviata',
              inAssemblaggio:   'In lavorazione',
              scaduta:          'Scaduta',
              acquisita:        'Acquisita',
              undefined:        'Stato non definito'
            };
            const statusLabel = statusLabels[statusKey] || 'Stato non definito';

            return (
              <li
                key={index}
                className="p-2 border-b flex items-center justify-between hover:bg-gray-200 cursor-pointer transform transition duration-200 hover:scale-105"
                onClick={() => onOpenCalendar(commessa)}
              >
                <div className="flex items-center">
                  <button
                    onClick={e => { e.stopPropagation(); handleEditCommessa(commessa); }}
                    className="mr-2 px-2 py-1 border border-blue-500 text-blue-500 rounded text-sm hover:scale-105"
                    title="Modifica commessa"
                  >mod</button>
                 
<button
  onClick={e => {
    e.stopPropagation();
    fetch("http://192.168.1.250:3001/api/open-folder-local", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ folderPath: commessa.percorso }),
})
  .then(res => res.json())
  // .then(data => {
  //   alert("🚀 Cartella richiesta!\nSe AppTimePass è attivo, si aprirà tra 1-2 secondi.");
  // })
  .catch(err => {
    alert("⚠️ Errore! Assicurati che AppTimePass.exe sia in esecuzione!\n\n" + err);
  });

  }}
  title="Apri cartella locale"
  className="mr-2 hover:scale-105 inline-block"
>
  <Folder size={20} className="text-blue-500" />
</button>
                  <span className="font-semibold">
                    {`${commessa.brand || ''}_${productName || ''}_${commessa.codiceProgetto || ''}_${commessa.codiceCommessa || ''}`}
                  </span>
                </div>
                <div className="flex items-center">
                  {complete && 
                    <Check size={20} className="text-green-500 mr-1 hover:scale-105" />
                  }
                  <span>{getStatusDot(commessa)}</span>

                  <button
                    onClick={e => {
                      e.stopPropagation();
                      const excelRow = [
                        commessa.codiceCommessa || "",
                        "",
                        (commessa.brand || "").toUpperCase(),
                        productName.toUpperCase(),
                        commessa.quantita || "",
                        commessa.dataConsegna || "",
                        "",
                        "",
                        `file://${commessa.percorso}` || ""
                      ].join("\t");
                      copyToClipboard(excelRow);
                    }}
                    className="ml-2 px-2 py-1 bg-blue-500 text-white text-sm rounded hover:scale-105"
                    title="Copia riga Excel"
                  >xls</button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
