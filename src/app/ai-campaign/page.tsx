"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Bot, Send, Loader2, CheckCircle2, AlertCircle, Brain,
  Sparkles, ArrowRight, Target, BarChart3, Mail, Clock,
  Zap, Play,
} from "lucide-react";

interface PipelineStats {
  planned: boolean;
  scraped: number;
  analyzed: number;
  diagnosed: number;
  qualified: number;
  emailsGenerated: number;
  totalTokens: number;
}

interface CampaignPlan {
  campaignName: string;
  sector: string;
  city: string | null;
  region: string | null;
  reasoning: string;
  targetProfile: string;
  expectedService: string;
}

interface LogEntry {
  id: number;
  campaignId: number | null;
  leadId: number | null;
  type: string;
  message: string;
  progress: number | null;
  metadata: string | null;
  createdAt: string;
  campaign?: { name: string } | null;
}

const EXAMPLE_PROMPTS = [
  "Trova ristoranti a Milano che non hanno un sito moderno",
  "Cerca hotel e B&B in Toscana senza sistema di prenotazione online",
  "Trova studi dentistici a Roma che non hanno un gestionale",
  "Cerca negozi di abbigliamento a Napoli senza e-commerce",
  "Trova palestre e centri fitness a Bologna con sito lento",
  "Cerca agenzie immobiliari in Veneto senza CRM online",
];

const LOG_ICONS: Record<string, typeof CheckCircle2> = {
  ai_plan: Brain,
  ai_analysis: Sparkles,
  ai_qualify: Target,
  ai_generate: Mail,
  ai_done: CheckCircle2,
  ai_error: AlertCircle,
  scrape_start: Play,
  scrape_progress: ArrowRight,
  scrape_done: CheckCircle2,
  scrape_error: AlertCircle,
};

function logColor(type: string) {
  if (type.includes("error")) return "text-red-400";
  if (type === "ai_done" || type === "scrape_done") return "text-green-400";
  if (type.startsWith("ai_")) return "text-purple-400";
  if (type === "scrape_start") return "text-blue-400";
  return "text-[var(--muted-foreground)]";
}

function logBg(type: string) {
  if (type.includes("error")) return "bg-red-500/5";
  if (type === "ai_done" || type === "scrape_done") return "bg-green-500/5";
  if (type.startsWith("ai_")) return "bg-purple-500/5";
  return "";
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export default function AiCampaignPage() {
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [plan, setPlan] = useState<CampaignPlan | null>(null);
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [campaignId, setCampaignId] = useState<number | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async (cId: number) => {
    try {
      const res = await fetch(`/api/logs?campaignId=${cId}&limit=100`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setLogs(data);
        // Get latest progress
        const latest = data.find((l: LogEntry) => l.progress !== null);
        if (latest?.progress !== null && latest?.progress !== undefined) {
          setProgress(latest.progress);
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Polling while running
  useEffect(() => {
    if (running && campaignId) {
      pollRef.current = setInterval(() => fetchLogs(campaignId), 2000);
      return () => { if (pollRef.current) clearInterval(pollRef.current); };
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [running, campaignId, fetchLogs]);

  async function handleLaunch() {
    if (!prompt.trim()) return;
    setRunning(true);
    setError(null);
    setPlan(null);
    setStats(null);
    setLogs([]);
    setProgress(0);
    setCampaignId(null);

    try {
      const res = await fetch("/api/ai/auto-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Errore sconosciuto");
      } else {
        setPlan(data.plan);
        setStats(data.stats);
        setCampaignId(data.campaignId);
        setProgress(100);
        // Final fetch of all logs
        if (data.campaignId) {
          await fetchLogs(data.campaignId);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di rete");
    } finally {
      setRunning(false);
    }
  }

  // Also start polling as soon as we get the campaignId from the first log
  useEffect(() => {
    if (running && logs.length > 0 && !campaignId) {
      const firstLog = logs[0];
      if (firstLog?.campaignId) {
        setCampaignId(firstLog.campaignId);
      }
    }
  }, [running, logs, campaignId]);

  return (
    <div>
      <div className="page-header mb-6">
        <div>
          <h1 className="page-title">
            <Bot className="w-6 h-6 text-purple-400" />
            AI Campaign
          </h1>
          <p className="page-subtitle">Descrivi il target in linguaggio naturale. L&apos;AI pianifica, cerca, analizza e genera email — tutto in autonomia.</p>
        </div>
      </div>

      {/* Prompt Input */}
      <div className="section-card mb-6">
        <label className="block text-sm font-medium mb-2">Cosa vuoi cercare?</label>
        <div className="flex flex-col sm:flex-row gap-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="es. Trova ristoranti a Milano che hanno bisogno di un sito web moderno..."
            disabled={running}
            rows={3}
            className="input flex-1 resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !running) {
                e.preventDefault();
                handleLaunch();
              }
            }}
          />
          <button
            onClick={handleLaunch}
            disabled={running || !prompt.trim()}
            className="btn btn-primary sm:self-end"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {running ? "In corso..." : "Lancia AI"}
          </button>
        </div>

        {/* Example prompts */}
        {!running && !plan && (
          <div className="mt-4">
            <p className="text-xs text-[var(--muted-foreground)] mb-2">Esempi:</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_PROMPTS.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setPrompt(ex)}
                  className="text-xs px-3 py-1.5 rounded-full bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-400">Errore</p>
            <p className="text-sm text-red-300">{error}</p>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      {(running || progress > 0) && (
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4 mb-6">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="flex items-center gap-2">
              {running ? <Loader2 className="w-4 h-4 animate-spin text-purple-400" /> : <CheckCircle2 className="w-4 h-4 text-green-400" />}
              {running ? "Pipeline AI in esecuzione..." : "Pipeline completata!"}
            </span>
            <span className="font-mono font-semibold text-purple-400">{progress}%</span>
          </div>
          <div className="w-full h-3 bg-[var(--muted)] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${running ? "bg-purple-500" : "bg-green-500"}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* AI Plan Card */}
      {plan && (
        <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-xl border border-purple-500/30 p-6 mb-6">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <Brain className="w-5 h-5 text-purple-400" />
            Piano AI
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-[var(--muted-foreground)]">Campagna:</span>{" "}
              <span className="font-semibold">{plan.campaignName}</span>
            </div>
            <div>
              <span className="text-[var(--muted-foreground)]">Settore:</span>{" "}
              <span className="font-semibold">{plan.sector}</span>
            </div>
            {plan.city && (
              <div>
                <span className="text-[var(--muted-foreground)]">Città:</span>{" "}
                <span className="font-semibold">{plan.city}</span>
              </div>
            )}
            {plan.region && (
              <div>
                <span className="text-[var(--muted-foreground)]">Regione:</span>{" "}
                <span className="font-semibold">{plan.region}</span>
              </div>
            )}
            <div className="md:col-span-2">
              <span className="text-[var(--muted-foreground)]">Strategia:</span>{" "}
              <span>{plan.reasoning}</span>
            </div>
            <div>
              <span className="text-[var(--muted-foreground)]">Profilo target:</span>{" "}
              <span>{plan.targetProfile}</span>
            </div>
            <div>
              <span className="text-[var(--muted-foreground)]">Servizio Bitora:</span>{" "}
              <span className="text-purple-400 font-medium">{plan.expectedService}</span>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {[
            { label: "Lead trovati", value: stats.scraped, icon: Target, color: "text-blue-400" },
            { label: "Analizzati", value: stats.analyzed, icon: BarChart3, color: "text-yellow-400" },
            { label: "Diagnosi AI", value: stats.diagnosed, icon: Brain, color: "text-purple-400" },
            { label: "Qualificati", value: stats.qualified, icon: Sparkles, color: "text-cyan-400" },
            { label: "Email generate", value: stats.emailsGenerated, icon: Mail, color: "text-green-400" },
            { label: "Token usati", value: stats.totalTokens.toLocaleString(), icon: Zap, color: "text-orange-400" },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="kpi-card text-center">
                <Icon className={`w-5 h-5 mx-auto mb-1 ${stat.color}`} />
                <p className="kpi-value">{stat.value}</p>
                <p className="kpi-label">{stat.label}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Live Activity Log */}
      {logs.length > 0 && (
        <div className="section-card">
          <h2 className="section-title flex items-center gap-2">
            <Clock className="w-5 h-5 text-[var(--muted-foreground)]" />
            Log Attività AI
            <span className="text-xs font-normal text-[var(--muted-foreground)]">
              ({logs.length} eventi)
            </span>
          </h2>
          <div className="space-y-1 max-h-[500px] overflow-y-auto">
            {[...logs].reverse().map((entry) => {
              const Icon = LOG_ICONS[entry.type] || ArrowRight;
              return (
                <div
                  key={entry.id}
                  className={`flex items-start gap-3 px-3 py-2 rounded-lg text-sm ${logBg(entry.type)}`}
                >
                  <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${logColor(entry.type)}`} />
                  <div className="flex-1 min-w-0">
                    <p className={logColor(entry.type)}>{entry.message}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-[var(--muted-foreground)]">{formatTime(entry.createdAt)}</span>
                      {entry.progress !== null && (
                        <span className="text-xs font-mono text-purple-400">{entry.progress}%</span>
                      )}
                      {entry.metadata && (() => {
                        try {
                          const meta = JSON.parse(entry.metadata);
                          if (meta.tokensUsed) return <span className="text-xs text-orange-400">{meta.tokensUsed} tokens</span>;
                        } catch { /* ignore */ }
                        return null;
                      })()}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      {/* Post-completion CTA */}
      {stats && !running && (
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="/leads"
            className="btn btn-primary"
          >
            <Target className="w-4 h-4" /> Vedi Lead
          </a>
          <a
            href="/messages"
            className="btn btn-success"
          >
            <Mail className="w-4 h-4" /> Vedi Messaggi
          </a>
          <a
            href="/campaigns"
            className="btn btn-ghost"
          >
            <Send className="w-4 h-4" /> Campagne
          </a>
          <button
            onClick={() => {
              setPlan(null);
              setStats(null);
              setLogs([]);
              setProgress(0);
              setCampaignId(null);
              setPrompt("");
            }}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium flex items-center gap-2"
          >
            <Zap className="w-4 h-4" /> Nuova Ricerca AI
          </button>
        </div>
      )}
    </div>
  );
}
