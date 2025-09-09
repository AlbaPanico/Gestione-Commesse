// File: protek.jsx
import React, { useEffect, useMemo, useState } from "react";
import NewSlideProtek from "./NewSlideProtek";

/** ───────────────────────── Utils ───────────────────────── **/

// Accede anche a path annidati tipo "program.NAME"
function readPath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur && Object.prototype.hasOwnProperty.call(cur, p)) {
      cur = cur[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

// Ritorna il primo campo non vuoto trovando tra vari alias
function pick(r, keys) {
  for (const k of keys) {
    const v = k.includes(".") ? readPath(r, k) : r?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return undefined;
}

// Normalizza "YYYY-MM-DD HH:mm:ss" → "YYYY-MM-DDTHH:mm:ss"
function normalizeDate(ts) {
  if (!ts) return ts;
  if (typeof ts !== "string") return ts;
  const t = ts.trim();
  // Se è già ISO con 'T' lascio stare
  if (t.includes("T")) return t;
  // Se è formato comune SQL con spazio, sostituisco con 'T'
  // e rimuovo eventuali millisecondi/UTC strani
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?$/.test(t)) {
    return t.replace(" ", "T");
  }
  return ts;
}

/** Utilità formattazione data/ora (accetta ISO o SQL-like) */
function fmtDate(ts) {
  if (!ts) return "—";
  const nt = normalizeDate(ts);
  const d = new Date(nt);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuration(start, end) {
  const s = normalizeDate(start);
  const e = normalizeDate(end);
  if (!s || !e) return "—";
  const a = new Date(s).getTime();
  const b = new Date(e).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return "—";
  const ms = b - a;
  const mins = Math.floor(ms / 60000);
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return `${hh}h ${mm}m`;
}

/** ───────────────────── Component ───────────────────── **/

export default function ProtekPage({ onBack }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("ALL");
  const [refreshedAt, setRefreshedAt] = useState("");
  const [meta, setMeta] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // alias usati per resilienza contro payload diversi
  const ALIAS = {
    code: [
      "code", "programCode", "program_code",
      "name", "NAME", "programName", "program_name",
      "program.NAME", "program.name", "partProgramName", "PROGRAM_NAME"
    ],
    description: ["description", "descrizione", "note", "NOTE", "desc", "programDescription"],
    customer: ["customer", "customerName", "customer_name", "CUSTOMER_NAME"],
    state: ["latestState", "state", "latest_state", "STATE"],
    start: ["startTime", "firstStart", "startedAt", "DATE_STARTED", "start", "start_date"],
    end: ["endTime", "lastEnd", "completedAt", "DATE_COMPLETED", "end", "end_date"],
    count: ["numWorkings", "workings", "count", "NUM", "NUM_WORKINGS"]
  };

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/protek/programs");
      if (!res.ok) {
        const msg =
          res.status === 404
            ? "Percorso CSV Protek non configurato o non raggiungibile."
            : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      const j = await res.json();

      // Normalizzo ogni riga applicando i fallback degli alias
      const programs = Array.isArray(j?.programs) ? j.programs : [];
      const normalized = programs.map((r, i) => ({
        id: r.id ?? r.ID ?? i,
        code: pick(r, ALIAS.code),
        description: pick(r, ALIAS.description),
        customer: pick(r, ALIAS.customer),
        latestState: pick(r, ALIAS.state),
        startTime: pick(r, ALIAS.start),
        endTime: pick(r, ALIAS.end),
        numWorkings: pick(r, ALIAS.count) ?? 0,
        // mantengo l’originale per eventuale debug
        __raw: r
      }));

      setRows(normalized);
      setRefreshedAt(new Date().toISOString());
      setMeta(j.meta || null);
    } catch (e) {
      setError(String(e?.message || e));
      setRows([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const passesSearch =
        !q ||
        String(r.code || "").toLowerCase().includes(q) ||
        String(r.description || "").toLowerCase().includes(q) ||
        String(r.customer || "").toLowerCase().includes(q);

      const passesState =
        stateFilter === "ALL" ||
        String(r.latestState || "").toLowerCase() === stateFilter.toLowerCase();

      return passesSearch && passesState;
    });
  }, [rows, search, stateFilter]);

  return (
    <div className="w-full h-full flex flex-col gap-3 p-4">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold">Protek – Monitor Lavorazioni</div>
        <div className="flex items-center gap-2">
          {/* Home come Stampanti: usa onBack */}
          <button
            className="p-2 rounded-xl shadow hover:shadow-md"
            title="Torna allo Splash"
            aria-label="Home"
            onClick={onBack}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5"
              viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 10.5L12 3l9 7.5" />
              <path d="M5.5 9.5V20a1.5 1.5 0 0 0 1.5 1.5h10A1.5 1.5 0 0 0 18.5 20V9.5" />
              <path d="M9 21v-6h6v6" />
            </svg>
          </button>

          <button
            className="px-3 py-1 rounded-xl shadow text-sm hover:shadow-md flex items-center gap-2"
            title="Impostazioni Protek"
            onClick={() => setSettingsOpen(true)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4"
              viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 3.4l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c0 .66.39 1.26 1 1.51.16.07.33.11.51.11H21a2 2 0 1 1 0 4h-.09c-.18 0-.35.04-.51.11-.61.25-1 .85-1 1.51z"></path>
            </svg>
            Impostazioni
          </button>

          <button
            className="px-3 py-1 rounded-xl shadow text-sm hover:shadow-md"
            onClick={load}
            title="Aggiorna"
          >
            Aggiorna
          </button>
        </div>
      </div>

      {/* INFO BAR */}
      <div className="text-xs text-gray-500 flex items-center gap-3 flex-wrap">
        <div>
          Path monitorato:{" "}
          <span className="font-mono">{meta?.monitorPath || "—"}</span>
        </div>
        <div>
          • aggiornato:{" "}
          {refreshedAt ? new Date(refreshedAt).toLocaleString("it-IT") : "—"}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <input
            className="border rounded-lg px-2 py-1 text-sm"
            placeholder="Cerca per codice/descrizione/cliente"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="border rounded-lg px-2 py-1 text-sm"
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            title="Filtro stato"
          >
            <option value="ALL">Tutti gli stati</option>
            <option value="STARTED">STARTED</option>
            <option value="RUNNING">RUNNING</option>
            <option value="PAUSED">PAUSED</option>
            <option value="FINISHED">FINISHED</option>
            <option value="DONE">DONE</option>
          </select>
        </div>
      </div>

      {/* ERRORI */}
      {error && (
        <div className="p-2 rounded bg-red-100 text-red-700 text-sm">
          {error}{" "}
          {String(error).toLowerCase().includes("percorso csv") && (
            <>
              —{" "}
              <button className="underline" onClick={() => setSettingsOpen(true)}>
                Configura ora
              </button>
            </>
          )}
        </div>
      )}

      {/* TABELLA */}
      <div className="flex-1 overflow-auto rounded-2xl border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50">
            <tr className="text-left">
              <th className="p-2">Program Code</th>
              <th className="p-2">Descrizione</th>
              <th className="p-2">Cliente</th>
              <th className="p-2">Stato</th>
              <th className="p-2">Inizio</th>
              <th className="p-2">Fine</th>
              <th className="p-2">Durata</th>
              <th className="p-2"># Lavorazioni</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-gray-400">
                  Caricamento…
                </td>
              </tr>
            )}
            {!loading && !error && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-gray-400">
                  Nessun dato da mostrare
                </td>
              </tr>
            )}
            {!loading &&
              !error &&
              filtered.map((r) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-mono">{r.code || "—"}</td>
                  <td className="p-2">{r.description || "—"}</td>
                  <td className="p-2">{r.customer || "—"}</td>
                  <td className="p-2">{r.latestState || "—"}</td>
                  <td className="p-2">{fmtDate(r.startTime)}</td>
                  <td className="p-2">{fmtDate(r.endTime)}</td>
                  <td className="p-2">{fmtDuration(r.startTime, r.endTime)}</td>
                  <td className="p-2">{r.numWorkings ?? 0}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-gray-500">
        Totale righe: <b>{rows?.length ?? 0}</b>
      </div>

      {/* SLIDE-OVER IMPOSTAZIONI */}
      {settingsOpen && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[1px] flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-[min(1100px,96vw)] h-[min(90vh,820px)] overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b">
              <div className="text-base font-semibold">Impostazioni Protek</div>
              <button
                className="px-3 py-1 rounded-xl shadow text-sm hover:shadow-md"
                onClick={() => {
                  setSettingsOpen(false);
                  setTimeout(load, 100);
                }}
              >
                Chiudi
              </button>
            </div>
            <div className="h-[calc(100%-48px)] overflow-auto">
              <NewSlideProtek
                onSaved={() => load()}
                onClose={() => {
                  setSettingsOpen(false);
                  setTimeout(load, 100);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
