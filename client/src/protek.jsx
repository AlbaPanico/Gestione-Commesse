// File: NewSlideProtek.jsx
import React, { useEffect, useState } from "react";

export default function NewSlideProtek({ server, onClose, onSaved }) {
  const SERVER = server || "http://192.168.1.250:3001";

  const [monitorPath, setMonitorPath] = useState("");
  const [pantografi, setPantografi] = useState([]);
  const [diagMsg, setDiagMsg] = useState("");
  const [savingMsg, setSavingMsg] = useState("");

  // Carica impostazioni salvate
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${SERVER}/api/protek/settings`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (typeof data?.monitorPath === "string") setMonitorPath(data.monitorPath);
        if (Array.isArray(data?.pantografi)) setPantografi(data.pantografi);
      } catch (e) {
        console.warn("Caricamento impostazioni Protek:", e);
      }
    })();
  }, [SERVER]);

  const verifyPath = async () => {
    setDiagMsg("Verifica in corso…");
    try {
      const res = await fetch(`${SERVER}/api/protek/diagnose-path`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: monitorPath, monitorPath }),
      });
      if (!res.ok) {
        setDiagMsg(`✗ HTTP ${res.status}: percorso non raggiungibile.`);
        return;
      }
      const data = await res.json().catch(() => ({}));
      const ok = !!data?.ok || !!data?.reachable;
      setDiagMsg(ok ? "✓ Percorso raggiungibile." : "✗ Percorso non raggiungibile.");
    } catch (e) {
      setDiagMsg(`✗ Errore: ${String(e?.message || e)}`);
    }
  };

  const save = async () => {
    setSavingMsg("Salvataggio…");
    try {
      const res = await fetch(`${SERVER}/api/protek/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monitorPath: (monitorPath || "").trim(),
          pantografi,
        }),
      });
      if (!res.ok) {
        setSavingMsg(`Salvataggio fallito: HTTP ${res.status}`);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data && (data.ok === true || data.status === "ok")) {
        setSavingMsg("✓ Impostazioni salvate.");
        onSaved && onSaved();
      } else {
        setSavingMsg("Salvataggio: risposta non JSON o formato inatteso.");
      }
    } catch (e) {
      setSavingMsg(`Errore: ${String(e?.message || e)}`);
    }
  };

  const addPantografo = () => setPantografi((arr) => [...arr, { name: "", code: "" }]);
  const updatePantografo = (idx, field, value) =>
    setPantografi((arr) => arr.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  const removePantografo = (idx) =>
    setPantografi((arr) => arr.filter((_, i) => i !== idx));

  return (
    <div className="w-full h-full p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-lg font-semibold">Impostazioni Protek</div>
        <button
          className="px-3 py-1 rounded-xl shadow text-sm hover:shadow-md"
          onClick={() => onClose && onClose({ monitorPath, pantografi })}
        >
          Chiudi
        </button>
      </div>

      {/* Monitor path */}
      <div className="mb-3">
        <label className="block text-sm font-medium mb-1">
          Percorso cartella CSV (monitorPath)
        </label>
        <input
          className="w-full border rounded-lg px-2 py-1 font-mono"
          value={monitorPath}
          onChange={(e) => setMonitorPath(e.target.value)}
          placeholder="\\\\server\\share\\cartella\\PROTEK\\Ricevuti"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            className="px-3 py-1 rounded-xl shadow text-sm hover:shadow-md"
            onClick={verifyPath}
          >
            Verifica percorso
          </button>
          {diagMsg && (
            <span
              className={
                "text-sm " +
                (diagMsg.startsWith("✓") ? "text-green-700" : "text-red-600")
              }
            >
              {diagMsg}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Inserisci il percorso UNC dove si trovano i file CSV di Protek.
        </p>
      </div>

      {/* Pantografi opzionali */}
      <div className="mb-4">
        <div className="text-sm font-medium mb-1">Pantografi (opzionale)</div>
        {pantografi.length === 0 && (
          <div className="text-sm text-gray-500 mb-2">Nessun pantografo inserito.</div>
        )}
        {pantografi.map((p, idx) => (
          <div key={idx} className="flex items-center gap-2 mb-2">
            <input
              className="border rounded px-2 py-1 text-sm"
              placeholder="Nome"
              value={p.name || ""}
              onChange={(e) => updatePantografo(idx, "name", e.target.value)}
            />
            <input
              className="border rounded px-2 py-1 text-sm"
              placeholder="Codice"
              value={p.code || ""}
              onChange={(e) => updatePantografo(idx, "code", e.target.value)}
            />
            <button
              className="px-2 py-1 text-sm rounded border"
              onClick={() => removePantografo(idx)}
              title="Rimuovi"
            >
              Rimuovi
            </button>
          </div>
        ))}
        <button
          className="px-3 py-1 rounded-xl shadow text-sm hover:shadow-md"
          onClick={addPantografo}
        >
          Aggiungi pantografo
        </button>
      </div>

      {/* Azioni */}
      <div className="flex items-center gap-3">
        <button
          className="px-3 py-1 rounded-xl shadow text-sm hover:shadow-md"
          onClick={save}
        >
          Salva impostazioni
        </button>
        <button
          className="px-3 py-1 rounded-xl text-sm hover:shadow-md border"
          onClick={() => onClose && onClose({ monitorPath, pantografi })}
        >
          Chiudi
        </button>
        {savingMsg && (
          <span
            className={
              "text-sm " +
              (savingMsg.startsWith("✓") ? "text-green-700" : "text-gray-700")
            }
          >
            {savingMsg}
          </span>
        )}
        <span className="text-xs text-gray-500 ml-2">
          I dati resteranno memorizzati sul server.
        </span>
      </div>
    </div>
  );
}
