// File: protek.jsx
import React, { useEffect, useMemo, useState } from "react";
import NewSlideProtek from "./NewSlideProtek";

/* ----------------- fetch robusto ----------------- */
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
  } catch {}
  return { ok: res.ok, status: res.status, data, text };
}

/* ----------------- util formattazione ----------------- */
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

/* ----------------- helpers di normalizzazione ----------------- */
const first = (...vals) => vals.find(v => v !== undefined && v !== null && v !== "") ?? "";
const toISO = (d, t) => {
  // accetta date "YYYY-MM-DD" / "DD/MM/YYYY" ed orari "HH:mm[:ss]"
  if (!d) return null;
  try {
    if (t) return new Date(`${d} ${t}`).toISOString();
    return new Date(d).toISOString();
  } catch { return null; }
};

export default function ProtekPage({ onBack, server }) {
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

  /* ----- normalizza da /programs ----- */
  const normalizeFromPrograms = (list = []) =>
    list.map((p, i) => ({
      id: p.id ?? `${p.code || "row"}-${i}`,
      code: first(p.code, p.programCode, p.ProgramCode, p.name, p.Program),
      description: first(p.description, p.descrizione, p.programDescription, p.note, p.title),
      customer: first(p.customer, p.customerName, p.client, p.cliente),
      latestState: first(p.latestState, p.state, p.status, p.Stato, p.Status),
      startTime: first(
        p.startTime,
        toISO(p.startDate, p.startTime),
        p.startedAt,
        p.start_date
      ) || null,
      endTime: first(
        p.endTime,
        toISO(p.endDate, p.endTime),
        p.completedAt,
        p.readyDate
      ) || null,
      numWorkings: p.numWorkings ?? p.workings ?? 0,
    }));

  /* ----- normalizza da /jobs (molto tollerante) ----- */
  const normalizeFromJobs = (list = []) =>
    list.map((j, i) => {
      const r = j.job && typeof j.job === "object" ? j.job : j; // dati annidati?
      const code = first(
        j.code, r?.code, r?.jobCode, r?.JobCode, r?.programCode, r?.ProgramCode, r?.name
      );
      const description = first(
        j.description, r?.description, r?.jobDescription, r?.desc, r?.title, r?.note
      );
      const customer = first(
        j.customer, r?.customer, r?.customerName, r?.client, r?.cliente, r?.customer?.name
      );
      const latestState = first(
        j.latestState, r?.latestState, j.state, r?.state, j.status, r?.status, r?.Stato, r?.Status
      );

      // I CSV "jobs" in genere non hanno orari — provo comunque a derivare se presenti
      const startTime = first(
        j.startTime, r?.startTime, toISO(r?.startDate, r?.startTime), r?.startedAt
      ) || null;
      const endTime = first(
        j.endTime, r?.endTime, toISO(r?.endDate, r?.endTime), r?.completedAt, r?.readyDate
      ) || null;

      const numWorkings = first(
        j.numWorkings, r?.numWorkings,
        j?.totals?.piecesFromNestings,
        j?.totals?.qtyOrdered,
        Array.isArray(j?.orders) ? j.orders.length : undefined
      );
      return {
        id: j.id ?? r?.id ?? `${code || "job"}-${i}`,
        code, description, customer, latestState,
        startTime, endTime,
        numWorkings: typeof numWorkings === "number" ? numWorkings : 0,
      };
    });

  /* ----------------- load ----------------- */
  const load = async () => {
    try {
      setLoading(true);
      setError("");

      let rowsNorm = [];
      let metaObj = null;

      // prova /programs
      const r1 = await safeFetchJson(api("/api/protek/programs"));
      if (r1.ok && Array.isArray(r1.data?.programs)) {
        rowsNorm = normalizeFromPrograms(r1.data.programs);
        metaObj = r1.data.meta || r1.data.__meta || null;
      }

      // fallback /jobs se /programs vuoto/assente
      if (!rowsNorm.length) {
        const r2 = await safeFetchJson(api("/api/protek/jobs"));
        if (!r2.ok) {
          const msg =
            r2.data?.error ||
            (r2.status === 404 ? "Endpoint non trovato." : `HTTP ${r2.status}`);
          throw new Error(msg);
        }
        const data = r2.data || {};
        rowsNorm = normalizeFromJobs(Array.isArray(data.jobs) ? data.jobs : []);
        metaObj = data.meta || data.__meta || null;
      }

      setRows(rowsNorm);
      setMeta(metaObj);
      setRefreshedAt(new Date().toISOString());
    } catch (e) {
      setRows([]);
      setError(String(e?.message || e));
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
    const hay = [
      r.code, r.description, r.customer,
      r.operators, r.machines,
      String(r.ordersCount), String(r.qtyOrdered), String(r.piecesFromNestings),
    ].join(" | ").toLowerCase();

    const passesSearch = !q || hay.includes(q);
    const passesState =
      stateFilter === "ALL" ||
      (r.latestState || "").toLowerCase() === stateFilter.toLowerCase();

    return passesSearch && passesState;
  });
}, [rows, search, stateFilter]);


  return (
    <div className="w-full h-full flex flex-col gap-3 p-4">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold">Protek – Monitor Lavorazioni</div>
        <div className="flex items-center gap-2">
          {/* HOME come Stampanti */}
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

      {/* INFO + FILTRI */}
      <div className="text-xs text-gray-500 flex items-center gap-3 flex-wrap">
        <div>
          Path monitorato:{" "}
          <span className="font-mono">{meta?.monitorPath || "—"}</span>
        </div>
        <div>• aggiornato: {refreshedAt ? new Date(refreshedAt).toLocaleString("it-IT") : "—"}</div>
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

      {/* ERROR */}
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
      {loading ? (
        <tr>
          <td colSpan={8} className="p-6 text-center text-gray-400">Caricamento…</td>
        </tr>
      ) : !error && filtered.length === 0 ? (
        <tr>
          <td colSpan={8} className="p-6 text-center text-gray-400">Nessun dato da mostrare</td>
        </tr>
      ) : (
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
        ))
      )}
    </tbody>
  </table>
</div>


      {/* FOOTER */}
      <div className="text-xs text-gray-500">Totale righe: <b>{rows?.length ?? 0}</b></div>

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
