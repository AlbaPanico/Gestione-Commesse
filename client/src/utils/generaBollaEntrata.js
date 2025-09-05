// src/utils/generaBollaEntrata.js
// ❗️Versione “thin client”: nessuna generazione/avanzamento lato browser.
// Delega tutto al server su /api/genera-bolla-entrata (idempotente).

export async function generaBollaEntrataCompleta({
  commessa,
  materialiPath,    // facoltativo; se presente lo useremo solo per risalire al folderPath
  reportDdtPath,    // facoltativo; il server legge già le impostazioni e aggiorna Excel
  materiali = []    // non più usato qui (gestito dal server)
}) {
  try {
    // Ricava il folderPath della commessa
    let folderPath =
      (commessa && (commessa.percorso || commessa.folderPath)) ||
      null;

    if (!folderPath && materialiPath) {
      // se ci hanno passato direttamente la cartella MATERIALI, risalgo alla root commessa
      folderPath = String(materialiPath).replace(/[\\/]+MATERIALI[\\/]?$/i, "");
    }

    if (!folderPath) {
      alert("Impossibile determinare la cartella della commessa (folderPath).");
      return;
    }

    // Chiamo l'endpoint unico del server che:
    // - sincronizza i progressivi
    // - compila e salva il PDF (scrittura atomica, no doppioni)
    // - avanza il progressivo SOLO se davvero scritto
    // - aggiorna l'Excel (se configurato)
    const res = await fetch("http://192.168.1.250:3001/api/genera-bolla-entrata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        folderPath,
        advance: true,
        // eventuali info extra, se in futuro servono
        extra: { reportDdtPath: reportDdtPath || "" }
      })
    });

    // Provo a leggere il payload anche in caso di errore per mostrare un messaggio utile
    let data = {};
    try { data = await res.json(); } catch {}

    if (!res.ok || (data && data.ok === false)) {
      const msg = (data && (data.error || data.message)) || res.statusText || "Errore generazione DDT Entrata";
      alert("Errore generazione DDT Entrata:\n" + msg);
      return;
    }

    // Tutto ok: il server ha creato (o rilevato) la W
    // data può contenere: { ok, path, fileName, numeroDoc, dataDocIT, codiceVisivo, materialiPath, note? }
    // NB: 'path' è un percorso server, non apribile direttamente dal browser.
    if (data.note && typeof data.note === "string") {
      // Esempio: "DDT W già presente: evitata duplicazione"
      console.log("[generaBollaEntrataCompleta] Nota server:", data.note);
    } else {
      console.log("[generaBollaEntrataCompleta] Creata bolla W:", data.fileName || "(nome non disponibile)");
    }

    return data;
  } catch (e) {
    alert("Errore generazione DDT Entrata:\n" + (e?.message || String(e)));
  }
}
