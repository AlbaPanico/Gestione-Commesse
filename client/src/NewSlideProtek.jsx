// File: NewSlideProtek.jsx
import React, { useEffect, useMemo, useState } from "react";

/** Utility fetch robusta: prova a parsare JSON anche con header sbagliato */
async function safeFetchJson(input, init) {
  const res = await fetch(input, init);
  const ct = (res.headers.get("content-type") || "").toLowerCase();

  let data = undefined;
  let text = undefined;

  try {
    if (ct.includes("application/json")) {
      // risposta “ufficialmente” JSON
      data = await res.json();
    } else {
      // risposta non-JSON: leggo testo e provo il parse manuale
      text = await res.text();
      const t = (text || "").trim();
      if (t.startsWith("{") || t.startsWith("[")) {
        try { data = JSON.parse(t); } catch { /* resta text */ }
      }
    }
  } catch {
    // se res.json() fallisce (body malformato), ripiego su text
    try {
      text = await res.text();
      const t = (text || "").trim();
      if (t.startsWith("{") || t.startsWith("[")) {
        try { data = JSON.parse(t); } catch {}
      }
    } catch {}
  }

  // __nonJson = TRUE solo se non siamo riusciti ad ottenere un oggetto JSON
  const nonJson = typeof data === "undefined";

  return { ok: res.ok, status: res.status, data, text, __nonJson: nonJson };
}

export default function NewSlideProtek({ onSaved, onClose, asPanel }) {
  // Modalità pannello quando aperto dall’ingranaggio
  const panelMode = (typeof asPanel === "boolean") ? asPanel : (typeof onClose === "function");

  // UI state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [success, setSuccess] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState("");

  // settings
  const [monitorPath, setMonitorPath] = useState("");   // UNC folder con i CSV
  const [pantografi, setPantografi] = useState([]);     // opzionale

  // data solo per la vista “pagina autonoma”
  const [jobs, setJobs] = useState([]);
  const [meta, setMeta] = useState(null);

  // ────────────────────────────────────────────────────────────────────────────
  async function reloadSettingsFromServer() {
    const r = await safeFetchJson("/api/protek/settings");
    if (r.__nonJson) {
      setError("Impossibile leggere le impostazioni Protek (risposta non JSON).");
      return;
    }
    if (!r.ok) {
      setError("Errore nel recupero impostazioni Protek.");
      return;
    }
    const s = r.data || {};
    setMonitorPath(s.monitorPath || "");
    setPantografi(Array.isArray(s.pantografi) ? s.pantografi : []);
  }

  // Carica impostazioni all'avvio (+ jobs se NON pannello)
  useEffect(() => {
    (async () => {
      setError("");
      setInfo("");
      setSuccess("");
      await reloadSettingsFromServer();
      if (!panelMode && monitorPath) {
        await loadJobs();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelMode]);

  // ────────────────────────────────────────────────────────────────────────────
  async function loadJobs() {
    setLoading(true);
    setError("");
    setInfo("");
    setSuccess("");
    try {
      const r = await safeFetchJson("/api/protek/jobs");
      if (r.__nonJson) {
        setError(
          `Errore caricamento jobs: HTTP ${r.status} – ` +
          `Percorso Protek non configurato o non raggiungibile.`
        );
        setJobs([]);
        setMeta(null);
        return;
      }
      if (!r.ok) {
        const msg = r.data?.error || "Errore sconosciuto";
        setError(`Errore caricamento jobs: HTTP ${r.status} – ${msg}`);
        setJobs([]);
        setMeta(null);
        return;
      }
      setJobs(r.data.jobs || []);
      setMeta(r.data.meta || null);
      if (!r.data.jobs || r.data.jobs.length === 0) {
        setInfo("Nessun job trovato nei CSV correnti.");
      }
    } catch (e) {
      setError(`Errore rete: ${String(e)}`);
      setJobs([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // ────────────────────────────────────────────────────────────────────────────
async function saveSettings(e) {
  e?.preventDefault?.();
  setError("");
  setInfo("");
  setSuccess("");

  if (!monitorPath || !monitorPath.trim()) {
    setError("Inserisci il percorso cartella CSV (monitorPath).");
    return;
  }

  const body = { monitorPath: monitorPath.trim(), pantografi };

  try {
    setSaving(true);
    const r = await safeFetchJson("/api/protek/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"        // <— chiediamo esplicitamente JSON
      },
      body: JSON.stringify(body),
    });

    // Se il server risponde 2xx, consideriamo il salvataggio riuscito anche se non JSON
    if (!r.ok) {
      const extra = r.__nonJson && r.text ? ` — ${String(r.text).slice(0, 120)}…` : "";
      setError(`Errore nel salvataggio impostazioni Protek (HTTP ${r.status}).${extra}`);
      return;
    }

    // Ricarico le impostazioni dal server per mostrare i valori persistiti
    await reloadSettingsFromServer();

    const hhmm = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    setLastSavedAt(hhmm);
    setSuccess(r.__nonJson ? `✓ Salvato alle ${hhmm} (risposta non JSON)` : `✓ Salvato alle ${hhmm}`);
    onSaved?.(); // notifica il genitore (protek.jsx) per ricaricare tabella

  } catch (e) {
    setError(`Errore salvataggio impostazioni: ${String(e)}`);
  } finally {
    setSaving(false);
  }
}


  // ────────────────────────────────────────────────────────────────────────────
  const totalJobs = useMemo(() => jobs.length, [jobs]);

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER in modalità PANNELLO (solo form impostazioni)
  if (panelMode) {
    return (
      <div className="p-4 flex flex-col gap-4">
        {error ? (
          <div className="p-2 rounded bg-red-100 text-red-700 text-sm">{error}</div>
        ) : null}
        {success ? (
          <div className="p-2 rounded bg-green-100 text-green-700 text-sm">{success}</div>
        ) : null}
        {info ? (
          <div className="p-2 rounded bg-blue-100 text-blue-700 text-sm">{info}</div>
        ) : null}

        <form className="flex flex-col gap-4" onSubmit={saveSettings}>
          <div>
            <label className="block text-sm font-medium">
              Percorso cartella CSV (monitorPath)
            </label>
            <input
              type="text"
              className="mt-1 w-full border rounded-lg p-2 font-mono"
              placeholder={`\\\\\\\\192.168.1.248\\\\time dati\\\\ARCHIVIO TECNICO\\\\Esportazioni 4.0\\\\PROTEK\\\\Ricevuti`}
              value={monitorPath}
              onChange={(e) => {
                setSuccess(""); // se l'utente modifica, nascondo il "salvato"
                setMonitorPath(e.target.value);
              }}
              disabled={saving}
            />
            <p className="mt-1 text-xs text-gray-500">
              Inserisci il percorso UNC dove si trovano i file CSV di Protek.
            </p>
          </div>

          {/* opzionale: gestione elenco pantografi */}
          <fieldset className="border rounded-lg p-3">
            <legend className="text-sm font-medium px-1">Pantografi (opzionale)</legend>
            <PantografiEditor
              value={pantografi}
              onChange={(v) => { setSuccess(""); setPantografi(v); }}
            />
          </fieldset>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="px-3 py-2 rounded-xl shadow text-sm hover:shadow-md disabled:opacity-60"
              disabled={saving}
              title={saving ? "Salvataggio in corso…" : "Salva impostazioni"}
            >
              {saving ? "Salvo…" : "Salva impostazioni"}
            </button>
            {typeof onClose === "function" && (
              <button
                type="button"
                className="px-3 py-2 rounded-xl text-sm hover:shadow"
                onClick={() => onClose?.()}
                disabled={saving}
              >
                Chiudi
              </button>
            )}
            <div className="text-xs text-gray-500">
              {lastSavedAt ? `Ultimo salvataggio: ${lastSavedAt}` : "I dati resteranno memorizzati sul server."}
            </div>
          </div>
        </form>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER pagina autonoma (toolbar + tabella + modale impostazioni interno)
  // (manteniamo lo stesso comportamento di successo/disabilitazione)
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="w-full h-full flex flex-col gap-3 p-4">

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold">Protek – Monitor Jobs</div>

        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1 rounded-xl shadow text-sm hover:shadow-md"
            onClick={() => setSettingsOpen(true)}
            title="Apri impostazioni Protek"
          >
            Impostazioni
          </button>
          <button
            className="px-3 py-1 rounded-xl shadow text-sm hover:shadow-md"
            onClick={loadJobs}
            disabled={loading}
            title="Ricarica dai CSV"
          >
            {loading ? "Carico..." : "Aggiorna"}
          </button>
          {typeof onClose === "function" && (
            <button
              className="px-3 py-1 rounded-xl text-sm hover:shadow"
              onClick={() => onClose?.()}
              title="Chiudi"
            >
              Chiudi
            </button>
          )}
        </div>
      </div>

      {/* Messaggi stato */}
      {error ? (
        <div className="p-2 rounded bg-red-100 text-red-700 text-sm">{error}</div>
      ) : null}
      {success ? (
        <div className="p-2 rounded bg-green-100 text-green-700 text-sm">{success}</div>
      ) : null}
      {info ? (
        <div className="p-2 rounded bg-blue-100 text-blue-700 text-sm">{info}</div>
      ) : null}

      {/* Meta path */}
      {meta?.monitorPath ? (
        <div className="text-xs text-gray-500">
          Path monitorato: <span className="font-mono">{meta.monitorPath}</span>
          {meta.generatedAt ? (
            <span> • aggiornato: {new Date(meta.generatedAt).toLocaleString()}</span>
          ) : null}
        </div>
      ) : (
        <div className="text-xs text-gray-500">
          Nessun percorso Protek configurato: apri <b>Impostazioni</b> e inserisci il path dei CSV.
        </div>
      )}

      {/* Tabella Jobs (UNICA TABELLA) */}
      <div className="flex-1 overflow-auto rounded-2xl border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50">
            <tr className="text-left">
              <th className="p-2">Job Code</th>
              <th className="p-2">Descrizione</th>
              <th className="p-2">Cliente</th>
              <th className="p-2">Stato</th>
              <th className="p-2">Q.ty Ordinate</th>
              <th className="p-2">Pezzi da Nesting</th>
              <th className="p-2">Ordini (riassunto)</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => {
              const totQ = j?.totals?.qtyOrdered ?? 0;
              const totP = j?.totals?.piecesFromNestings ?? 0;
              return (
                <tr key={j.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-medium">{j.code || "-"}</td>
                  <td className="p-2">{j.description || "-"}</td>
                  <td className="p-2">{j.customer || "-"}</td>
                  <td className="p-2">{j.latestState || "-"}</td>
                  <td className="p-2">{totQ}</td>
                  <td className="p-2">{totP}</td>
                  <td className="p-2">
                    {Array.isArray(j.orders) && j.orders.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {j.orders.map((o) => (
                          <div key={o.id} className="text-xs">
                            <span className="font-mono">{o.code}</span>{" "}
                            • q={o.qtyOrdered} • pezzi={o.piecesFromNestings} • stato={o.latestState || "-"}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {totalJobs === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-gray-400">
                  Nessun dato da mostrare
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Footer piccolo */}
      <div className="text-xs text-gray-500">Totale jobs: <b>{totalJobs}</b></div>

      {/* ─────────── PANNELLO IMPOSTAZIONI (modal interna) ─────────── */}
      {settingsOpen && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[1px] flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-[min(800px,94vw)] max-h-[90vh] overflow-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div className="text-lg font-semibold">Impostazioni Protek</div>
              <button
                className="px-3 py-1 rounded-xl shadow text-sm hover:shadow-md"
                onClick={() => setSettingsOpen(false)}
                title="Chiudi impostazioni"
                disabled={saving}
              >
                Chiudi
              </button>
            </div>

            {/* Corpo */}
            <form className="p-4 flex flex-col gap-4" onSubmit={saveSettings}>
              {error ? (
                <div className="p-2 rounded bg-red-100 text-red-700 text-sm">{error}</div>
              ) : null}
              {success ? (
                <div className="p-2 rounded bg-green-100 text-green-700 text-sm">{success}</div>
              ) : null}
              {info ? (
                <div className="p-2 rounded bg-blue-100 text-blue-700 text-sm">{info}</div>
              ) : null}

              <div>
                <label className="block text-sm font-medium">
                  Percorso cartella CSV (monitorPath)
                </label>
                <input
                  type="text"
                  className="mt-1 w-full border rounded-lg p-2 font-mono"
                  placeholder={`\\\\\\\\192.168.1.248\\\\time dati\\\\ARCHIVIO TECNICO\\\\Esportazioni 4.0\\\\PROTEK\\\\Ricevuti`}
                  value={monitorPath}
                  onChange={(e) => { setSuccess(""); setMonitorPath(e.target.value); }}
                  disabled={saving}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Inserisci il percorso UNC dove si trovano i file CSV di Protek.
                </p>
              </div>

              {/* opzionale: gestione elenco pantografi */}
              <fieldset className="border rounded-lg p-3">
                <legend className="text-sm font-medium px-1">Pantografi (opzionale)</legend>
                <PantografiEditor
                  value={pantografi}
                  onChange={(v) => { setSuccess(""); setPantografi(v); }}
                />
              </fieldset>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="px-3 py-2 rounded-xl shadow text-sm hover:shadow-md disabled:opacity-60"
                  disabled={saving}
                >
                  {saving ? "Salvo…" : "Salva impostazioni"}
                </button>
                <button
                  type="button"
                  className="px-3 py-2 rounded-xl text-sm hover:shadow"
                  onClick={() => setSettingsOpen(false)}
                  disabled={saving}
                >
                  Annulla
                </button>
                <div className="text-xs text-gray-500">
                  {lastSavedAt ? `Ultimo salvataggio: ${lastSavedAt}` : "I dati resteranno memorizzati sul server."}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/** Editor semplice per array di pantografi */
function PantografiEditor({ value, onChange }) {
  const list = Array.isArray(value) ? value : [];

  function add() {
    onChange([...(list || []), { name: "", code: "" }]);
  }
  function update(i, k, v) {
    const clone = [...list];
    clone[i] = { ...clone[i], [k]: v };
    onChange(clone);
  }
  function remove(i) {
    const clone = [...list];
    clone.splice(i, 1);
    onChange(clone);
  }

  return (
    <div className="flex flex-col gap-2">
      {list.length === 0 && (
        <div className="text-xs text-gray-400">Nessun pantografo inserito.</div>
      )}
      {list.map((p, i) => (
        <div key={i} className="grid grid-cols-2 gap-2 items-center">
          <input
            className="border rounded p-2"
            placeholder="Nome"
            value={p.name || ""}
            onChange={(e) => update(i, "name", e.target.value)}
          />
          <div className="flex gap-2">
            <input
              className="border rounded p-2 flex-1"
              placeholder="Codice / ID"
              value={p.code || ""}
              onChange={(e) => update(i, "code", e.target.value)}
            />
            <button type="button" className="px-2 rounded border" onClick={() => remove(i)}>
              Rimuovi
            </button>
          </div>
        </div>
      ))}
      <div>
        <button type="button" className="px-2 py-1 rounded border" onClick={add}>
          Aggiungi pantografo
        </button>
      </div>
    </div>
  );
}
