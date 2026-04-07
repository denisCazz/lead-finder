"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { ScrollText, RefreshCw, Trash2 } from "lucide-react";

interface LogEntry { id: number; level: string; source: string; message: string; details: string | null; createdAt: string }

const LEVEL_BADGE: Record<string, string> = { info: "badge-blue", warning: "badge-yellow", error: "badge-red", success: "badge-green" };
const LEVEL_LABEL: Record<string, string> = { info: "Info", warning: "Avviso", error: "Errore", success: "OK" };

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState<string>("all");
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => { setLoading(true); const res = await fetch(`/api/logs${level !== "all" ? `?level=${level}` : ""}`); setLogs(await res.json()); setLoading(false); }, [level]);

  useEffect(() => { load(); }, [load]);

  const clear = async () => { if (!confirm("Eliminare tutti i log?")) return; await fetch("/api/logs", { method: "DELETE" }); load(); };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"><ScrollText className="w-6 h-6 text-[var(--primary)]" /> Log di sistema</h1>
          <p className="page-subtitle">{logs.length} eventi</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn btn-outline"><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Aggiorna</button>
          <button onClick={clear} className="btn btn-danger"><Trash2 className="w-4 h-4" /> Pulisci</button>
        </div>
      </div>

      <div className="tab-bar w-fit mb-6">
        {["all", "info", "warning", "error", "success"].map((l) => (
          <button key={l} onClick={() => setLevel(l)} className={`tab-btn ${level === l ? "tab-btn-active" : ""}`}>
            {l === "all" ? "Tutti" : LEVEL_LABEL[l] || l}
          </button>
        ))}
      </div>

      {logs.length === 0 ? (
        <div className="empty-state"><p>{loading ? "Caricamento..." : "Nessun log trovato"}</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Data</th><th>Livello</th><th>Sorgente</th><th>Messaggio</th></tr></thead>
            <tbody>
              {logs.map((log) => (
                <Fragment key={log.id}>
                  <tr onClick={() => setExpanded(expanded === log.id ? null : log.id)} className="cursor-pointer">
                    <td className="text-[var(--muted-foreground)] whitespace-nowrap text-xs">{new Date(log.createdAt).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
                    <td><span className={`badge ${LEVEL_BADGE[log.level] || "badge-gray"}`}>{LEVEL_LABEL[log.level] || log.level}</span></td>
                    <td className="font-mono text-xs text-[var(--muted-foreground)]">{log.source}</td>
                    <td className="max-w-md truncate">{log.message}</td>
                  </tr>
                  {expanded === log.id && log.details && (
                    <tr key={`${log.id}-detail`}>
                      <td colSpan={4} className="!p-3">
                        <pre className="text-xs bg-[var(--background)] p-3 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-60">{log.details}</pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
