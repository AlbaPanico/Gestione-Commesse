import React, { useState } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import './calendar-custom.css';

const BlueTriangle = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 12 12">
    <polygon points="6,2 11,10 1,10" fill="#4299E1" />
  </svg>
);


// Icone espandi/riduci
const ExpandIcon = ({ size = 22 }) => (
  <svg width={size} height={size} fill="none" viewBox="0 0 24 24">
    <rect x="3" y="3" width="8" height="2" rx="1" fill="#004C84"/>
    <rect x="3" y="3" width="2" height="8" rx="1" fill="#004C84"/>
    <rect x="13" y="19" width="8" height="2" rx="1" fill="#004C84"/>
    <rect x="19" y="13" width="2" height="8" rx="1" fill="#004C84"/>
  </svg>
);
const CollapseIcon = ({ size = 22 }) => (
  <svg width={size} height={size} fill="none" viewBox="0 0 24 24">
    <rect x="5" y="5" width="2" height="8" rx="1" fill="#004C84"/>
    <rect x="5" y="5" width="8" height="2" rx="1" fill="#004C84"/>
    <rect x="17" y="17" width="2" height="8" rx="1" transform="rotate(-90 17 17)" fill="#004C84"/>
    <rect x="17" y="17" width="8" height="2" rx="1" transform="rotate(-90 17 17)" fill="#004C84"/>
  </svg>
);

// Formatta "DD/MM/YYYY"
const formatLocalDate = (date) => {
  const day = ('0' + date.getDate()).slice(-2);
  const month = ('0' + (date.getMonth() + 1)).slice(-2);
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

// Raggruppa commesse per data
const groupCommesseByDate = (commesse) => {
  const result = {};
  commesse.forEach(commessa => {
    if (commessa.archiviata) return;  // <-- skip archiviata

    if (commessa.dataConsegna) {
      let dateObj;
      if (commessa.dataConsegna.includes("-")) {
        const [year, month, day] = commessa.dataConsegna.split("-");
        dateObj = new Date(year, month - 1, day);
      } else if (commessa.dataConsegna.includes("/")) {
        const [day, month, year] = commessa.dataConsegna.split("/");
        dateObj = new Date(year, month - 1, day);
      }
      if (dateObj) {
        const key = formatLocalDate(dateObj);
        if (!result[key]) result[key] = [];
        result[key].push(commessa);
      }
    }
  });
  return result;
};

// Restituisce il pallino di stato
function getStatusDot(commessa) {
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

  // In produzione ma scaduta (pallino rosso lampeggiante con bordo verde)
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
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: "#F56565",
          border: "2px solid #48BB78",
          marginRight: 8,
        }}
        title="In produzione ma scaduta"
      ></span>
    );
  }
  // Produzione finita ma non archiviata (x rossa lampeggiante)
  if (commessa.fineProduzioneEffettiva && !commessa.archiviata) {
    return (
      <span
        className="blinking"
        style={{
          color: "#F56565",
          fontWeight: "bold",
          fontSize: "18px",
          lineHeight: "10px",
          width: 12,
          height: 12,
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
  // Solo scaduta (pallino rosso lampeggiante)
  if (commessaDate < today) {
    return (
      <span
        className="blinking"
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#F56565",
          display: "inline-block",
          marginRight: 8,
        }}
        title="Scaduta"
      ></span>
    );
  }
  // In produzione e non scaduta (pallino verde)
  if (commessa.inizioProduzione && commessaDate >= today) {
    return (
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#48BB78",
          display: "inline-block",
          marginRight: 8,
        }}
        title="In produzione"
      ></span>
    );
  }
 // Acquisita/futura (triangolino blu)
return (
  <span style={{ display: "inline-block", marginRight: 8 }} title="Acquisita">
    <BlueTriangle size={12} />
  </span>
);

}

export default function CalendarSlide({ commesse = [], onClickDay, selectedDate, onCommessaClick }) {
  const [fullscreen, setFullscreen] = useState(false);

  // Raggruppa le commesse per giorno (locale)
  const deliveriesByDate = groupCommesseByDate(commesse);

  // Render dei pallini nei giorni del calendario
  const tileContent = ({ date, view }) => {
    if (view === 'month') {
      const formattedDate = formatLocalDate(date);
      const commesseDelGiorno = deliveriesByDate[formattedDate] || [];
      if (commesseDelGiorno.length === 0) return null;

      const dots = commesseDelGiorno.map((commessa, idx) => {
  if (commessa.archiviata) return null;
  return (
    <span key={`dot-${commessa.id || commessa.nome || idx}`}>
      {getStatusDot(commessa)}
    </span>
  );
}).filter(Boolean);


      if (dots.length === 0) return null;
      return (
        <div
          className="delivery-dots"
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '2px',
            marginTop: '2px'
          }}
        >
          {dots}
        </div>
      );
    }
    return null;
  };

  // Stili dinamici per fullscreen/normale
  const containerClass = fullscreen
    ? "fixed inset-0 w-screen h-screen z-[100] bg-white flex items-center justify-center transition-all duration-300"
    : "fixed top-4 bottom-4 right-4 w-1/4 transition-all duration-300";

  const contentClass = fullscreen
    ? "bg-white w-[95vw] h-[95vh] rounded-lg p-6 shadow-2xl overflow-y-auto"
    : "bg-white rounded-lg p-4 overflow-y-auto h-full";

  // Handler click commessa: chiude fullscreen e passa la commessa
  const handleCommessaClick = (commessa) => {
    setFullscreen(false); // Torna sempre compatto!
    if (onCommessaClick) onCommessaClick(commessa);
  };

  return (
    <div className={containerClass} style={{ boxShadow: fullscreen ? "0 8px 32px rgba(0,0,0,0.18)" : "0 4px 8px rgba(128,128,128,0.5)" }}>
      {/* Bottone espandi/riduci */}
      <button
        onClick={() => setFullscreen(f => !f)}
        style={{
          position: "absolute",
          top: 18,
          right: 24,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          zIndex: 110,
          transition: "transform 0.15s",
        }}
        title={fullscreen ? "Riduci finestra" : "Schermo intero"}
      >
        {fullscreen ? <CollapseIcon /> : <ExpandIcon />}
      </button>
      <div className={contentClass}>
        <h2 className="text-xl font-bold text-blue-900 mb-4 text-center">Calendario</h2>
        <Calendar
          onClickDay={onClickDay}
          tileContent={tileContent}
          value={selectedDate ? selectedDate : null}
          className="w-full"
        />

        {/* --- ELENCO COMMESSE DEL GIORNO --- */}
        {selectedDate && (() => {
          // Filtro le commesse del giorno selezionato
          const key = formatLocalDate(new Date(selectedDate));
          const commesseDelGiorno = deliveriesByDate[key] || [];
          if (commesseDelGiorno.length === 0) return null;
          return (
            <div className="mt-6 p-4 bg-gray-100 rounded-lg shadow-inner">
              <h3 className="text-lg font-bold mb-2 text-blue-900">
                Commesse per il {key}
              </h3>
              <ul>
                {commesseDelGiorno.map((commessa, idx) => (
                  <li
                    key={commessa.nome || commessa.id || idx}
                    className="py-1 border-b border-gray-300 flex justify-between items-center cursor-pointer hover:bg-blue-100 transition"
                    onClick={() => handleCommessaClick(commessa)}
                  >
                    <span className="flex items-center font-medium">
                      {getStatusDot(commessa)}
                      {commessa.nome}
                    </span>
                    <span className="text-sm text-gray-600">
                      Q.tà: {commessa.quantita || 0}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
