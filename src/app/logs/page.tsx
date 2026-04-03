"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ScrollText, Play, ArrowRight, CheckCircle2, AlertCircle,
  Search, Brain, Sparkles, Target, Mail, RefreshCw, Filter,
  Clock, Zap, Send, MapPin,
} from "lucide-react";

interface Campaign { id: number; name: string; status: string; }
interface LogEntry {
  id: number; campaignId: number | null; leadId: number | null;
  type: string; message: string; progress: number | null;
  metadata: string | null; createdAt: string;
  campaign: { name: string } | null; lead: { companyName: string } | null;
}

const LOG_ICONS: Record<string, React.ElementType> = {
  scrape_start: Play, scrape_progress: ArrowRight, scrape_done: CheckCircle2,
  scrape_error: AlertCircle, analyze: Search, ai_plan: Brain, ai_analysis: Sparkles,
  ai_qualify: Target, ai_generate: Mail, ai_done: CheckCircle2, ai_error: AlertCircle,
  ai_city_suggestion: MapPin, ai_campaign_created: MapPin, campaign_completed: CheckCircle2,
  automation_continuous_start: RefreshCw, automation_continuous_done: CheckCircle2,
  automation_continuous_error: AlertCircle, backfill_start: RefreshCw, backfill_progress: Sparkles,
  backfill_done: CheckCircle2, backfill_error: AlertCircle, telegram_batch: Mail, send: Send, city: MapPin,
};
const LOG_COLORS: Record<string, string> = {
  scrape_error: "text-red-400", ai_error: "text-red-400",
  scrape_done: "text-green-400", ai_done: "text-green-400",
  send: "text-blue-400", scrape_start: "text-indigo-400",
  ai_analysis: "text-purple-400", ai_generate: "text-purple-400",
  ai_qualify: "text-purple-400", ai_plan: "text-purple-400",
  ai_city_suggestion: "text-emerald-400", ai_campaign_created: "text-emerald-400",
  campaign_completed: "text-green-400", automation_continuous_start: "text-cyan-400",
  automation_continuous_done: "text-green-400", automation_continuous_error: "text-red-400",
  backfill_start: "text-indigo-400", backfill_progress: "text-purple-400",
  backfill_done: "text-green-400", backfill_error: "text-red-400", telegram_batch: "text-sky-400",
};
const TYPE_FILTERS = [
  { value: "all", label: "Tutti" },
  { value: "scrape", label: "Scraping" },
  { value: "ai", label: "AI" },
  { value: "send", label: "Email" },
  { value: "analyze", label: "Analisi" },
];

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}
function timeAgo(date: Date) {
  const diff = Date.now() - date.getTime();
  if (diff < 60000) return `${Math.floor(diff / 1000)}s fa`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m fa`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h fa`;
  return `${Math.floor(diff / 86400000)}g fa`;
}

export default function LogsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const campLoaded = useRef(false);

  const fetchLogs = useCallback(async () => {
    const params = new URLSearchParams({ limit: "200" });
    if (selectedCampaign) params.set("campaignId", String(selectedCampaign));
    if (typeFilter !== "all") params.set("type", typeFilter);

    const promises: Promise<unknown>[] = [fetch(`/api/logs?${params}`).then((r) => r.json())];
    if (!campLoaded.current) {
      promises.push(fetch("/api/campaigns").then((r) => r.json()));
    }

    const [logsRes, campRes] = await Promise.all(promises);
    if (Array.isArray(logsRes)) setLogs(logsRes as LogEntry[]);
    if (campRes && Array.isArray(campRes)) {
      setCampaigns(campRes as Campaign[]);
      campLoaded.current = true;
    }
    setLastRefresh(new Date());
    setLoading(false);
  }, [selectedCampaign, typeFilter]);

  useEffect(() => {
    setLoading(true);
    fetchLogs();
  }, [selectedCampaign, typeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (autoRefresh) {
      pollRef.current = setInterval(fetchLogs, 3000);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [autoRefresh, fetchLogs]);

  const filtered = search.trim()
    ? logs.filter((l) => {
        const q = search.toLowerCase();
        return (
          l.message.toLowerCase().includes(q) ||
          l.campaign?.name.toLowerCase().includes(q) ||
          l.lead?.companyName.toLowerCase().includes(q)
        );
      })
    : logs;

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayCount = logs.filter((l) => new Date(l.createdAt) >= todayStart).length;
  const errCount = logs.filter((l) => l.type.includes("error")).length;
  const sentCount = logs.filter((l) => l.type === "send").length;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <ScrollText className="w-7 h-7 sm:w-8 sm:h-8 text-[var(--primary)]" />
            Log Attività
          </h1>
          <p className="text-[var(--muted-foreground)] mt-1 text-sm">Storico completo di job, analisi e invii</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              autoRefresh ? "bg-green-600 text-white" : "bg-[var(--muted)] text-[var(--foreground)]"
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${autoRefresh ? "animate-spin" : ""}`} />
            {autoRefresh ? "Live ON" : "Auto-refresh"}
          </button>
          <button
            onClick={() => { setLoading(true); fetchLogs(); }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--muted)] text-sm"
          >
            <RefreshCw className="w-4 h-4" /> Aggiorna
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Log Oggi", value: todayCount, icon: Clock, color: "text-blue-400" },
          { label: "Mostrati (max 200)", value: filtered.length, icon: ScrollText, color: "text-indigo-400" },
          { label: "Email Inviate", value: sentCount, icon: Send, color: "text-green-400" },
          { label: "Errori", value: errCount, icon: AlertCircle, color: "text-red-400" },
        ].map((s) => (
          <div key={s.label} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={`w-4 h-4 ${s.color}`} />
              <span className="text-xs text-[var(--muted-foreground)]">{s.label}</span>
            </div>
            <p className="text-2xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Campaign pill filters */}
      {campaigns.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setSelectedCampaign(null)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              selectedCampaign === null
                ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                : "bg-[var(--muted)] text-[var(--muted-foreground)]"
            }`}
          >
            Tutte
          </button>
          {campaigns.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCampaign(selectedCampaign === c.id ? null : c.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedCampaign === c.id
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "bg-[var(--muted)] text-[var(--muted-foreground)]"
              }`}
            >
              {c.name}
              {c.status === "active" && (
                <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-green-400 inline-block align-middle" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Type filter + search row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <div className="flex gap-1 bg-[var(--muted)] rounded-lg p-1">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                typeFilter === f.value
                  ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted-foreground)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca nei log…"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-sm"
          />
        </div>
        {lastRefresh && (
          <span className="text-xs text-[var(--muted-foreground)] ml-auto">
            Agg. {timeAgo(lastRefresh)}
          </span>
        )}
      </div>

      {/* Log table */}
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)]">
        {loading ? (
          <div className="text-center py-16 text-[var(--muted-foreground)]">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3" />
            Caricamento…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-[var(--muted-foreground)]">
            <ScrollText className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Nessun log trovato</p>
            <p className="text-sm mt-1">
              Lancia un job dalla pagina{" "}
              <a href="/jobs" className="text-[var(--primary)] underline">Jobs</a>
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)] max-h-[calc(100vh-420px)] overflow-y-auto">
            {filtered.map((entry) => {
              const Icon = LOG_ICONS[entry.type] ?? Zap;
              const isError = entry.type.includes("error");
              const isDone = entry.type.includes("done");
              const isSend = entry.type === "send";
              const colorClass = LOG_COLORS[entry.type] ?? "text-[var(--muted-foreground)]";
              return (
                <div
                  key={entry.id}
                  className={`flex items-start gap-3 px-4 py-3 text-sm ${
                    isError ? "bg-red-500/5" : isDone ? "bg-green-500/5" : isSend ? "bg-blue-500/5" : ""
                  }`}
                >
                  <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${colorClass}`} />
                  <div className="flex-1 min-w-0">
                    <p
                      className={
                        isError ? "text-red-400" : isDone ? "text-green-400" : isSend ? "text-blue-300" : "text-[var(--foreground)]"
                      }
                    >
                      {entry.message}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                      <span className="text-xs text-[var(--muted-foreground)]">{formatTime(entry.createdAt)}</span>
                      {entry.campaign && !selectedCampaign && (
                        <span className="text-xs text-[var(--muted-foreground)]">• {entry.campaign.name}</span>
                      )}
                      {entry.lead && (
                        <span className="text-xs text-[var(--muted-foreground)]">• {entry.lead.companyName}</span>
                      )}
                      {entry.progress !== null && (
                        <span className="text-xs font-mono text-[var(--primary)]">{entry.progress}%</span>
                      )}
                      <span className={`text-xs px-1.5 py-px rounded font-mono ${colorClass} bg-[var(--muted)]`}>
                        {entry.type}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-[var(--muted-foreground)] mt-2 text-right">
          {filtered.length} log mostrati (max 200)
        </p>
      )}
    </div>
  );
}
