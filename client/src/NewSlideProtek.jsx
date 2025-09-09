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
      data = await res.json();
    } else {
      text = await res.text();
      const t = (text || "").trim();
      if (t.startsWith("{") || t.startsWith("[")) {
        try { data = JSON.parse(t); } catch { /* resta text */ }
      }
    }
  } catch {
    try {
      text = await res.text();
      const t = (text || "").trim();
      if (t.startsWith("{") || t.startsWith("[")) {
        try { data = JSON.parse(t); } catch {}
      }
    } catch {}
  }

  return { ok: res.ok, status: res.status, data, text, __nonJson: typeof data === "undefined" };
}

export default function NewSlideProtek({ onSaved, onClose, asPanel, server }) {
  // Base URL assoluta come in Stampanti (prop -> env -> fallback IP)
  const API_BASE = (server || import.meta?.env?.VITE_API_BASE || "http://192.168.1.250:3001").replace(/\/+$/,"");
  const api = (p) => `${API_BASE}${p.startsWith("/") ? p : `/${p}`}`;

  // Modalità pannello quando aperto dall’ingranaggio
  const panelMode = (typeof asPanel === "boolean") ? asPanel : (typeof onClose === "function");

  // UI state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [success, setSuccess] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState("");

  // Verifica percorso
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState("idle"); // idle | ok | fail
  const [verifyMsg, setVerifyMsg] = useState("");
  const [verifyDetails, setVerifyDetails] = useState(null); // risposta completa diagnose-path
  const [verifyOpen, setVerifyOpen] = useState(false);      // mostra/nascondi pannellino dettagli

  // settings
  const [monitorPath, setMonitorPath] = useState("");   // UNC folder con i CSV
  const [pantografi, setPantografi] = useState([]);     // opzionale

  // data solo per la vista “pagina autonoma”
  const [jobs, setJobs] = useState([]);
  const [meta, setMeta] = useState(null);

  // ────────────────────────────────────────────────────────────────────────────
  async function reloadSettingsFromServer() {
    const r = await safeFetchJson(api("/api/protek/settings"));
    if (!r.ok) {
      setError("Errore nel recupero impostazioni Protek.");
      return null;
    }
    if (r.__nonJson && !r.data) {
      setError("Impossibile leggere le impostazioni Protek (risposta non JSON).");
      return null;
    }
    const s = r.data || {};
    setMonitorPath(s.monitorPath || "");
    setPantografi(Array.isArray(s.pantografi) ? s.pantografi : []);
    return s;
  }

  // Carica impostazioni all'avvio (+ jobs se NON pannello)
  useEffect(() => {
    (async () => {
      setError("");
      setInfo("");
      setSuccess("");
      const s = await reloadSettingsFromServer();
      if (!panelMode && s && s.monitorPath) {
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
      const r = await safeFetchJson(api("/api/protek/jobs"));
      if (!r.ok) {
        const msg = r.data?.error || `HTTP ${r.status}`;
        setError(
          msg.toLowerCase().includes("percorso")
            ? "Percorso Protek non configurato o non raggiungibile."
            : `Errore caricamento jobs: ${msg}`
        );
        setJobs([]);
        setMeta(null);
        return;
      }
      const data = r.data || {};
      const programs = Array.isArray(data.jobs) ? data.jobs : [];
      setJobs(programs);
      setMeta(data.meta || null);
      if (!programs.length) setInfo("Nessun job trovato nei CSV correnti.");
    } catch (e) {
      setError(`Errore rete: ${String(e)}`);
      setJobs([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Verifica percorso: prova diagnose-path, al 404 fa fallback su /api/protek/csv-direct
  async function verifyPath() {
    setVerifyBusy(true);
    setVerifyStatus("idle");
    setVerifyMsg("");
    setVerifyDetails(null);
    setVerifyOpen(false);
    setError("");

    // helper locale: verifica base tramite csv-direct
    const fallbackCsvDirect = async (pathToTest) => {
      const r2 = await safeFetchJson(api("/api/protek/csv-direct"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ monitorPath: pathToTest }),
      });
      if (!r2.ok) {
        setVerifyStatus("fail");
        setVerifyMsg(r2.data?.error || `HTTP ${r2.status}: percorso non raggiungibile.`);
        setVerifyDetails(null);
        setVerifyOpen(true);
        return;
      }
      const payload = r2.data || {};
      const jobsCount = Array.isArray(payload.JOBS) ? payload.JOBS.length : 0;
      const metaPath = payload.__meta?.monitorPath ? ` (${payload.__meta.monitorPath})` : "";
      setVerifyStatus("ok");
      setVerifyMsg(`Valido (verifica base). JOBS.csv: ${jobsCount} righe${metaPath}`);
      setVerifyDetails(null); // niente pannello dettagli nella verifica base
      setVerifyOpen(false);
    };

    try {
      const pathToTest = (monitorPath || "").trim();
      if (!pathToTest) {
        setVerifyStatus("fail");
        setVerifyMsg("Inserisci un percorso prima di verificare.");
        return;
      }

      const r = await safeFetchJson(api("/api/protek/diagnose-path"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ monitorPath: pathToTest }),
      });

      // Se l'endpoint non esiste (404), fallback immediato a csv-direct
      if (r.status === 404) {
        await fallbackCsvDirect(pathToTest);
        return;
      }

      // Altri errori: mostra errore e dettagli (se ci sono)
      if (!r.ok) {
        const msg = r.data?.error || `HTTP ${r.status}: percorso non raggiungibile.`;
        setVerifyStatus("fail");
        setVerifyMsg(msg);
        setVerifyDetails(r.data || null);
        setVerifyOpen(true);
        return;
      }

      // Diagnostica completa disponibile
      const d = r.data || {};
      setVerifyDetails(d);

      if (!d.existsPath) {
        setVerifyStatus("fail");
        setVerifyMsg("Percorso inesistente o non raggiungibile dal server.");
        setVerifyOpen(true);
        return;
      }
      if (!d.canRead) {
        setVerifyStatus("fail");
        setVerifyMsg("Accesso negato: controlla i permessi della share sul server.");
        setVerifyOpen(true);
        return;
      }

      const expectedCount = Object.keys(d.files || {}).length;
      const found = Number(d.readableCount || 0);
      const missingList = Array.isArray(d.missing) ? d.missing : [];

      if (found === 0) {
        setVerifyStatus("fail");
        setVerifyMsg("Cartella raggiunta ma nessun CSV atteso presente.");
        setVerifyOpen(true);
        return;
      }

      let msg = `Valido. Trovati ${found}/${expectedCount} CSV attesi.`;
      if (missingList.length) {
        const preview = missingList.slice(0, 3).join(", ");
        msg += ` Mancano: ${preview}${missingList.length > 3 ? "…" : ""}`;
      }

      setVerifyStatus("ok");
      setVerifyMsg(msg);
      setVerifyOpen(true);
    } catch (e) {
      setVerifyStatus("fail");
      setVerifyMsg(String(e));
      setVerifyOpen(true);
    } finally {
      setVerifyBusy(false);
    }
  }

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
      const r = await safeFetchJson(api("/api/protek/settings"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(body),
      });

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
                setSuccess("");          // se l'utente modifica, nascondo il "salvato"
                setVerifyStatus("idle"); // reset badge verifica
                setVerifyMsg("");
                setVerifyDetails(null);
                setVerifyOpen(false);
                setMonitorPath(e.target.value);
              }}
              disabled={saving}
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                className="px-2 py-1 rounded border text-sm disabled:opacity-60"
                onClick={verifyPath}
                disabled={verifyBusy || saving || !monitorPath.trim()}
                title="Verifica accessibilità e file CSV nella cartella indicata"
              >
                {verifyBusy ? "Verifico…" : "Verifica percorso"}
              </button>

              {/* Badge stato verifica */}
              {verifyStatus === "ok" && (
                <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-700">
                  ✓ {verifyMsg || "Valido"}
                </span>
              )}
              {verifyStatus === "fail" && (
                <span className="px-2 py-1 text-xs rounded bg-red-100 text-red-700">
                  ✗ {verifyMsg || "Non raggiungibile"}
                </span>
              )}
              {verifyStatus === "idle" && (
                <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-600">
                  In attesa di verifica
                </span>
              )}

              {(verifyStatus === "ok" || verifyStatus === "fail") && verifyDetails && (
                <button
                  type="button"
                  className="px-2 py-1 rounded border text-xs"
                  onClick={() => setVerifyOpen(v => !v)}
                >
                  {verifyOpen ? "Nascondi dettagli" : "Dettagli"}
                </button>
              )}
            </div>

            {/* Pannellino dettagli */}
            {verifyOpen && verifyDetails && (
              <div className="mt-2 border rounded-lg p-2 text-xs">
                <div className="mb-1 text-gray-700">
                  <b>Cartella:</b> <span className="font-mono">{verifyDetails.monitorPath}</span>
                </div>
                {!verifyDetails.existsPath && (
                  <div className="text-red-600">Percorso inesistente o non raggiungibile.</div>
                )}
                {verifyDetails.existsPath && !verifyDetails.canRead && (
                  <div className="text-red-600">Accesso negato (permessi insufficienti sulla share).</div>
                )}
                {verifyDetails.existsPath && verifyDetails.canRead && (
                  <>
                    <div className="mb-2">
                      Trovati {verifyDetails.readableCount}/{Object.keys(verifyDetails.files || {}).length} file attesi.
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {Object.entries(verifyDetails.files || {}).map(([name, info]) => (
                        <div key={name} className={`px-2 py-1 rounded border ${info?.exists ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                          <span className="font-mono">{name}</span>{" "}
                          {info?.exists ? (
                            <span className="text-green-700">✓ {typeof info.size === "number" ? `(${Math.round(info.size/1024)} KB)` : ""}</span>
                          ) : (
                            <span className="text-red-700">✗ mancante</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <p className="mt-2 text-xs text-gray-500">
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
                  onChange={(e) => {
                    setSuccess("");
                    setVerifyStatus("idle");
                    setVerifyMsg("");
                    setVerifyDetails(null);
                    setVerifyOpen(false);
                    setMonitorPath(e.target.value);
                  }}
                  disabled={saving}
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    className="px-2 py-1 rounded border text-sm disabled:opacity-60"
                    onClick={verifyPath}
                    disabled={verifyBusy || saving || !monitorPath.trim()}
                  >
                    {verifyBusy ? "Verifico…" : "Verifica percorso"}
                  </button>
                  {verifyStatus === "ok" && (
                    <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-700">
                      ✓ {verifyMsg || "Valido"}
                    </span>
                  )}
                  {verifyStatus === "fail" && (
                    <span className="px-2 py-1 text-xs rounded bg-red-100 text-red-700">
                      ✗ {verifyMsg || "Non raggiungibile"}
                    </span>
                  )}
                  {verifyStatus === "idle" && (
                    <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-600">
                      In attesa di verifica
                    </span>
                  )}
                  {(verifyStatus === "ok" || verifyStatus === "fail") && verifyDetails && (
                    <button
                      type="button"
                      className="px-2 py-1 rounded border text-xs"
                      onClick={() => setVerifyOpen(v => !v)}
                    >
                      {verifyOpen ? "Nascondi dettagli" : "Dettagli"}
                    </button>
                  )}
                </div>

                {verifyOpen && verifyDetails && (
                  <div className="mt-2 border rounded-lg p-2 text-xs">
                    <div className="mb-1 text-gray-700">
                      <b>Cartella:</b> <span className="font-mono">{verifyDetails.monitorPath}</span>
                    </div>
                    {!verifyDetails.existsPath && (
                      <div className="text-red-600">Percorso inesistente o non raggiungibile.</div>
                    )}
                    {verifyDetails.existsPath && !verifyDetails.canRead && (
                      <div className="text-red-600">Accesso negato (permessi insufficienti sulla share).</div>
                    )}
                    {verifyDetails.existsPath && verifyDetails.canRead && (
                      <>
                        <div className="mb-2">
                          Trovati {verifyDetails.readableCount}/{Object.keys(verifyDetails.files || {}).length} file attesi.
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {Object.entries(verifyDetails.files || {}).map(([name, info]) => (
                            <div key={name} className={`px-2 py-1 rounded border ${info?.exists ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                              <span className="font-mono">{name}</span>{" "}
                              {info?.exists ? (
                                <span className="text-green-700">✓ {typeof info.size === "number" ? `(${Math.round(info.size/1024)} KB)` : ""}</span>
                              ) : (
                                <span className="text-red-700">✗ mancante</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                <p className="mt-2 text-xs text-gray-500">
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
