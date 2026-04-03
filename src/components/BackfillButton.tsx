"use client";

import { useState } from "react";
import { RefreshCw, CheckCircle2, Terminal } from "lucide-react";

export function BackfillButton({ lastLog }: { lastLog: { message: string, createdAt: Date } | null }) {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  async function run() {
    setRunning(true);
    setDone(false);
    try {
      await fetch("/api/jobs/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job: "backfill", params: {} })
      });
      setDone(true);
      setTimeout(() => {
        setDone(false);
        window.location.reload();
      }, 2000);
    } catch {
      // ignora log lato client
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/35 p-4 flex flex-col justify-between">
      <div className="mb-4">
        <p className="text-sm font-medium">Svuota Coda Arretrato</p>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">Analizza i lead senza dettagli e compila i testi mancanti tramite AI.</p>
        {lastLog && (
          <p className="mt-3 text-xs text-[var(--muted-foreground)] border-t border-[var(--border)] pt-3">
            Ultimo run: <span className="font-medium text-[var(--foreground)]">{lastLog.message}</span>
            <span className="block mt-0.5 opacity-80">{new Date(lastLog.createdAt).toLocaleString("it-IT")}</span>
          </p>
        )}
      </div>
      <button 
        onClick={run} 
        disabled={running}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
      >
        {running ? <RefreshCw className="h-4 w-4 animate-spin shrink-0" /> : done ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Terminal className="h-4 w-4 shrink-0" />}
        <span className="truncate">{running ? "Esecuzione in corso..." : done ? "Job Lanciato" : "Smaltisci Arretrato"}</span>
      </button>
    </div>
  );
}