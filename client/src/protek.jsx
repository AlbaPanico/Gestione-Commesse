// File: protek.jsx
import React, { useEffect, useMemo, useState } from "react";
import NewSlideProtek from "./NewSlideProtek";

/** Fetch robusto: gestisce anche risposte non JSON */
async function safeFetchJson(input, init) {
  const res = await fetch(input, init);
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  let data, text;
  try {
    if (ct.includes("application/json")) data = await res.json();
    else {
      text = await res.text();
      const t = (text || "").trim();
      if (t.startsWith("{") || t.startsWith("[")) data = JSON.parse(t);
    }
  } catch {
    try {
      text = await res.text();
      const t = (text || "").trim();
      if (t.startsWith("{") || t.startsWith("[")) data = JSON.parse(t);
    } catch {}
  }
  return { ok: res.ok, status: res.status, data, text };
}

/** Utilità formattazione */
function fmtDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
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
  if (!start || !end) return "—";
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return "—";
  const mins = Math.floor((b - a) / 60000);
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return `${hh}h ${mm}m`;
}

export default function ProtekPage({ onBack, server }) {
  // stessa base URL di NewSlideProtek
  const API_BASE = (server || import.meta?.env?.VITE_API_BASE || "http://192.168.1.250:3001").replace(/\/+$/,"");
  const api = (p) => `${API_BASE}${p.startsWith("/") ? p : `/${p}`}`;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("ALL");
  const [refreshedAt, setRefreshedAt] = useState("");
  const [meta, setMeta] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // normalizzazioni
  const normalizeFromPrograms = (list = []) =>
    list.map((p, i) => ({
      id: p.id ?? `${p.code || "row"}-${i}`,
      code: p.code || "",
      description: p.description || "",
      customer: p.customer || "",
      latestState: p.latestState || "",
      startTime: p.startTime || null,
      endTime: p.endTime || null,
      numWorkings: p.numWorkings ?? 0,
    }));

  const normalizeFromJobs = (list = []) =>
    list.map((j, i) => ({
      id: j.id ?? `${j.code || "job"}-${i}`,
      code: j.code || "",
      description: j.description || "",
      customer: j.customer || "",
      latestState: j.latestState || "",
      // i CSV dei JOBS non hanno orari/working: lascio vuoto
      startTime: null,
      endTime: null,
      // qualcosa di utile in colonna: numero ordini o pezzi da nesting
      numWorkings:
        (typeof j?.totals?.piecesFromNestings === "number" && j.totals.piecesFromNestings) ||
        (Array.isArray(j?.orders) ? j.orders.length : 0),
    }));

  const load = async () => {
    try {
      setLoading(true);
      setError("");

      // 1) prova /programs
      let data = null;
      let metaObj = null;
      let rowsNorm = [];

      const r1 = await safeFetchJson(api("/api/protek/programs"));
      if (r1.ok && Array.isArray(r1.data?.programs)) {
        const arr = r1.data.programs;
        rowsNorm = normalizeFromPrograms(arr);
        metaObj = r1.data.meta || r1.data.__meta || null;
      }

      // 2) fallback /jobs se /programs assente o vuoto
      if (!rowsNorm.length) {
        const r2 = await safeFetchJson(api("/api/protek/jobs"));
        if (!r2.ok) {
          const msg =
            r2.data?.error ||
            (r2.status === 404
              ? "Endpoint non trovato. Verifica il backend."
              : `HTTP ${r2.status}`);
          throw new Error(msg);
        }
        data = r2.data || {};
        rowsNorm = normalizeFromJobs(Array.isArray(data.jobs) ? data.jobs : []);
        metaObj = data.meta || data.__meta || null;
      }

      setRows(rowsNorm);
      setMeta(metaObj);
      setRefreshedAt(new Date().toISOString());
    } catch (e) {
      setRows([]);
      // se arriva un 404 dal proxy, evita messaggio fuorviante
      const msg = String(e?.message || e);
      setError(msg);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const passesSearch =
        !q ||
        (r.code || "").toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q) ||
        (r.customer || "").toLowerCase().includes(q);

      const passesState =
        stateFilter === "ALL" ||
        (r.latestState || "").toLowerCase() === stateFilter.toLowerCase();

      return passesSearch && passesState;
    });
  }, [rows, search, stateFilter]);

  return (
    <div className="w-full h-full flex flex-col gap-3 p-4">
      {/* HEADER + TOOLBAR (come Stampanti) */}
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold">Protek – Monitor Lavorazioni</div>
        <div className="flex items-center gap-2">
          {/* HOME come in Stampanti: chiama onBack */}
          <button
            className="p-2 rounded-xl shadow hover:shadow-md"
            title="Torna allo Splash"
            aria-label="Home"
            onClick={onBack}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

      {/* BARRA INFO + FILTRI */}
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

      {/* MESSAGGI STATO */}
      {error && (
        <div className="p-2 rounded bg-red-100 text-red-700 text-sm">
          {error}
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

      {/* FOOTER */}
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
                server={API_BASE}
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
