"use client";

import Link from "next/link";
import { useState } from "react";
import { MapPin, Play, Loader2, CheckCircle2, XCircle, Terminal } from "lucide-react";

interface JobConfig {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  params?: Record<string, unknown>;
  extraFields?: { key: string; label: string; placeholder: string; required?: boolean }[];
}

const JOBS: JobConfig[] = [
  {
    id: "continuous",
    label: "Automazione Completa",
    description: "Crea automaticamente la prossima campagna AI per i settori configurati, avvia Ricerca Clienti, Analisi Clienti e Invio Mail in sequenza.",
    icon: Play,
    color: "emerald",
  },
  {
    id: "backfill",
    label: "Smaltisci Arretrato Lead",
    description: "Processa tutta la coda storica: cerca email dai siti, analizza i lead senza analisi, genera i testi mancanti e invia subito le email che l'AI approva.",
    icon: Terminal,
    color: "indigo",
  },
  {
    id: "suggest-cities",
    label: "Suggerisci Nuove Città",
    description: "Analizza lo storico città e propone la prossima zona più promettente per il settore scelto. Serve come debug del motore AI che alimenta il loop continuo.",
    icon: MapPin,
    color: "emerald",
    extraFields: [
      { key: "sector", label: "Settore", placeholder: "es: ristorante, hotel, edilizia, officine auto…", required: true },
    ],
    params: { autoCreate: true },
  },
];

type JobStatus = "idle" | "running" | "done" | "error";

interface JobState {
  status: JobStatus;
  result: unknown;
  startedAt?: number;
  duration?: number;
}

const COLOR_MAP: Record<string, string> = {
  indigo: "bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800",
  amber: "bg-amber-600 hover:bg-amber-700 disabled:bg-amber-800",
  emerald: "bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800",
};

const ICON_BG_MAP: Record<string, string> = {
  indigo: "bg-indigo-900/40 text-indigo-400",
  amber: "bg-amber-900/40 text-amber-400",
  emerald: "bg-emerald-900/40 text-emerald-400",
};

export default function JobsPage() {
  const [states, setStates] = useState<Record<string, JobState>>(() =>
    Object.fromEntries(JOBS.map((j) => [j.id, { status: "idle", result: null }]))
  );
  const [extraValues, setExtraValues] = useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries(JOBS.map((j) => [j.id, {}]))
  );

  function setJobState(id: string, update: Partial<JobState>) {
    setStates((prev) => ({ ...prev, [id]: { ...prev[id], ...update } }));
  }

  function setExtraValue(jobId: string, key: string, value: string) {
    setExtraValues((prev) => ({
      ...prev,
      [jobId]: { ...prev[jobId], [key]: value },
    }));
  }

  async function runJob(job: JobConfig) {
    const extra = extraValues[job.id] || {};

    // Validate required extra fields
    for (const field of job.extraFields || []) {
      if (field.required && !extra[field.key]?.trim()) {
        setJobState(job.id, {
          status: "error",
          result: { error: `Il campo "${field.label}" è obbligatorio.` },
        });
        return;
      }
    }

    const params: Record<string, unknown> = { ...(job.params || {}) };
    for (const [k, v] of Object.entries(extra)) {
      if (v) params[k] = v;
    }

    const startedAt = Date.now();
    setJobState(job.id, { status: "running", result: null, startedAt });

    try {
      const res = await fetch("/api/jobs/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job: job.id, params }),
      });
      const data = await res.json();
      const duration = Date.now() - startedAt;

      setJobState(job.id, {
        status: res.ok ? "done" : "error",
        result: data,
        duration,
      });
    } catch (e) {
      setJobState(job.id, {
        status: "error",
        result: { error: e instanceof Error ? e.message : "Errore sconosciuto" },
        duration: Date.now() - startedAt,
      });
    }
  }

  function formatDuration(ms?: number) {
    if (!ms) return "";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function formatResult(result: unknown): string {
    return JSON.stringify(result, null, 2);
  }

  const anyRunning = Object.values(states).some((s) => s.status === "running");

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <Terminal className="w-7 h-7 sm:w-8 sm:h-8 text-[var(--primary)]" />
        <h1 className="text-2xl sm:text-3xl font-bold">Esecuzione Job</h1>
      </div>
      <p className="text-sm text-[var(--muted-foreground)] mb-8">
        Lancia manualmente il motore automatico. In produzione va schedulata solo l&apos;Automazione Completa: crea campagne AI, esegue Ricerca Clienti, Analisi Clienti e Invio Mail.
      </p>

      <div className="grid max-w-6xl gap-6 xl:grid-cols-2">
        {JOBS.map((job) => {
          const state = states[job.id];
          const Icon = job.icon;
          const isRunning = state.status === "running";
          const isDone = state.status === "done";
          const isError = state.status === "error";

          return (
            <div
              key={job.id}
              className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 sm:p-6"
            >
              <div className="flex items-start gap-4 mb-4">
                <div className={`p-2.5 rounded-lg shrink-0 ${ICON_BG_MAP[job.color]}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-semibold">{job.label}</h2>
                  <p className="text-sm text-[var(--muted-foreground)] mt-0.5">{job.description}</p>
                </div>
              </div>

              {/* Extra fields */}
              {job.extraFields && (
                <div className="mb-4 space-y-3">
                  {job.extraFields.map((field) => (
                    <div key={field.key}>
                      <label className="block text-xs text-[var(--muted-foreground)] mb-1 font-medium">
                        {field.label}{field.required && <span className="text-red-400 ml-0.5">*</span>}
                      </label>
                      <input
                        type="text"
                        value={extraValues[job.id]?.[field.key] || ""}
                        onChange={(e) => setExtraValue(job.id, field.key, e.target.value)}
                        placeholder={field.placeholder}
                        disabled={isRunning}
                        className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-[var(--foreground)] text-sm disabled:opacity-50"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Run button */}
              <button
                onClick={() => runJob(job)}
                disabled={isRunning || anyRunning}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors ${COLOR_MAP[job.color]}`}
              >
                {isRunning ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                {isRunning ? "In esecuzione…" : "Lancia"}
              </button>

              {/* Status bar */}
              {state.status !== "idle" && (
                <div className="mt-4">
                  <div className="flex items-center gap-2 mb-2">
                    {isRunning && <Loader2 className="w-4 h-4 animate-spin text-[var(--muted-foreground)]" />}
                    {isDone && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                    {isError && <XCircle className="w-4 h-4 text-red-400" />}
                    <span className="text-xs text-[var(--muted-foreground)]">
                      {isRunning && "In esecuzione…"}
                      {isDone && `Completato ${state.duration ? `in ${formatDuration(state.duration)}` : ""}`}
                      {isError && `Errore ${state.duration ? `dopo ${formatDuration(state.duration)}` : ""}`}
                    </span>
                  </div>

                  {state.result !== null && (
                    <pre className={`text-xs rounded-lg p-3 overflow-x-auto max-h-72 whitespace-pre-wrap break-words font-mono ${
                      isError
                        ? "bg-red-950/50 border border-red-800 text-red-300"
                        : "bg-[var(--muted)] border border-[var(--border)] text-[var(--muted-foreground)]"
                    }`}>
                      {formatResult(state.result)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Info card */}
      <div className="mt-8 max-w-6xl bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-3">Uso corretto di questa pagina</h3>
        <div className="space-y-2 text-sm text-[var(--muted-foreground)]">
          <p>Questa pagina serve solo per trigger manuali e debug operativo.</p>
          <p>La configurazione dei cron automatici resta centralizzata in <Link href="/settings" className="text-[var(--foreground)] underline">Impostazioni → Automazione</Link>, così non hai istruzioni duplicate in due posti diversi.</p>
          <p>Flusso consigliato: usa <strong>Automazione Completa</strong> per il ciclo completo e <strong>Smaltisci Arretrato Lead</strong> quando devi recuperare la coda storica rimasta indietro.</p>
        </div>
      </div>
    </div>
  );
}
