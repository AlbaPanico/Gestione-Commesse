// File: protek.jsx
import React, { useEffect, useMemo, useState } from "react";

/** Utilità formattazione */
function fmtDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  // dd/MM/yyyy HH:mm
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
  const ms = b - a;
  const mins = Math.floor(ms / 60000);
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return `${hh}h ${mm}m`;
}

export default function ProtekPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("ALL");
  const [refreshedAt, setRefreshedAt] = useState("");
  const [meta, setMeta] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/protek/programs");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const j = await res.json();
      const programs = Array.isArray(j?.programs) ? j.programs : [];
      setRows(programs);
      setRefreshedAt(new Date().toISOString());
      setMeta(j.meta || null);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
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
      {/* HEADER + TOOLBAR */}
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold">Protek – Monitor Lavorazioni</div>
        <div className="flex items-center gap-2">
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
            {/* stati più frequenti visibili come opzioni */}
            <option value="STARTED">STARTED</option>
            <option value="RUNNING">RUNNING</option>
            <option value="PAUSED">PAUSED</option>
            <option value="FINISHED">FINISHED</option>
            <option value="DONE">DONE</option>
          </select>
        </div>
      </div>

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
          {!loading && error && (
            <tr>
              <td colSpan={8} className="p-6 text-center text-red-500">
                Errore: {error}
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
        Totale jobs: <b>{rows?.length ?? 0}</b>
      </div>
    </div>
  );
}
