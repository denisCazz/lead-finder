"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Megaphone, Play, Pause, Plus, Loader2, Clock, AlertCircle, CheckCircle2, Search, ArrowRight, Brain, Sparkles, Mail, Target } from "lucide-react";

interface Campaign {
  id: number;
  name: string;
  sector: string;
  region: string | null;
  city: string | null;
  status: string;
  createdAt: string;
  _count: { leads: number };
}

interface LogEntry {
  id: number;
  campaignId: number;
  type: string;
  message: string;
  progress: number | null;
  metadata: string | null;
  createdAt: string;
  campaign: { name: string };
}

const LOG_ICONS: Record<string, typeof CheckCircle2> = {
  scrape_start: Play,
  scrape_progress: ArrowRight,
  scrape_done: CheckCircle2,
  scrape_error: AlertCircle,
  analyze: Search,
  ai_plan: Brain,
  ai_analysis: Sparkles,
  ai_qualify: Target,
  ai_generate: Mail,
  ai_done: CheckCircle2,
  ai_error: AlertCircle,
};

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [scraping, setScraping] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", sector: "", region: "", city: "" });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState<Record<number, number>>({});
  const [selectedCampaign, setSelectedCampaign] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCampaigns = useCallback(async () => {
    const res = await fetch("/api/campaigns");
    const data = await res.json();
    setCampaigns(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  const fetchLogs = useCallback(async (campaignId?: number) => {
    const url = campaignId ? `/api/logs?campaignId=${campaignId}&limit=30` : "/api/logs?limit=50";
    const res = await fetch(url);
    const data = await res.json();
    if (Array.isArray(data)) {
      setLogs(data);
      // Extract latest progress per campaign
      const prog: Record<number, number> = {};
      for (const log of data) {
        if (log.progress !== null && !prog[log.campaignId]) {
          prog[log.campaignId] = log.progress;
        }
      }
      setProgress(prog);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
    fetchLogs();
  }, [fetchCampaigns, fetchLogs]);

  // Poll logs while scraping
  useEffect(() => {
    if (scraping) {
      pollRef.current = setInterval(() => {
        fetchLogs(scraping);
      }, 2000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [scraping, fetchLogs]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ name: "", sector: "", region: "", city: "" });
    setShowCreate(false);
    setCreating(false);
    fetchCampaigns();
  }

  async function handleRunScraper(campaignId: number) {
    setScraping(campaignId);
    setSelectedCampaign(campaignId);
    setProgress((p) => ({ ...p, [campaignId]: 0 }));
    await fetch("/api/scraper/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId }),
    });
    setScraping(null);
    fetchCampaigns();
    fetchLogs(campaignId);
  }

  async function toggleStatus(campaignId: number, currentStatus: string) {
    const newStatus = currentStatus === "active" ? "paused" : "active";
    await fetch(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchCampaigns();
  }

  const filteredLogs = selectedCampaign
    ? logs.filter((l) => l.campaignId === selectedCampaign)
    : logs;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Megaphone className="w-7 h-7 sm:w-8 sm:h-8 text-[var(--primary)]" />
            Campagne
          </h1>
          <p className="text-[var(--muted-foreground)] mt-1 text-sm">{campaigns.length} campagne</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 text-sm font-medium flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> Nuova Campagna
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Crea Nuova Campagna</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[var(--muted-foreground)] mb-1">Nome Campagna *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="es. Ristoranti Milano"
                className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-[var(--foreground)] text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--muted-foreground)] mb-1">Settore *</label>
              <input
                type="text"
                required
                value={form.sector}
                onChange={(e) => setForm({ ...form, sector: e.target.value })}
                placeholder="es. ristorante, hotel, edilizia"
                className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-[var(--foreground)] text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--muted-foreground)] mb-1">Regione</label>
              <input
                type="text"
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
                placeholder="es. Lombardia"
                className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-[var(--foreground)] text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--muted-foreground)] mb-1">Città</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="es. Milano"
                className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-[var(--foreground)] text-sm"
              />
            </div>
            <div className="md:col-span-2 flex gap-3">
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 disabled:opacity-50 text-sm font-medium"
              >
                {creating ? "Creazione..." : "Crea Campagna"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 bg-[var(--muted)] text-[var(--foreground)] rounded-lg hover:opacity-90 text-sm"
              >
                Annulla
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Campaigns List */}
      {loading ? (
        <div className="text-center py-16 text-[var(--muted-foreground)]">Caricamento...</div>
      ) : campaigns.length === 0 ? (
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-8 text-center text-[var(--muted-foreground)]">
          Nessuna campagna. Creane una per iniziare!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {campaigns.map((c) => {
            const pct = progress[c.id];
            const isActive = scraping === c.id;
            return (
              <div
                key={c.id}
                className={`bg-[var(--card)] rounded-xl border border-[var(--border)] p-6 cursor-pointer transition-all ${selectedCampaign === c.id ? "ring-2 ring-[var(--primary)]" : "hover:border-[var(--primary)]/50"}`}
                onClick={() => setSelectedCampaign(selectedCampaign === c.id ? null : c.id)}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">{c.name}</h3>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    c.status === "active" ? "bg-green-500/20 text-green-400" :
                    c.status === "paused" ? "bg-yellow-500/20 text-yellow-400" :
                    "bg-gray-500/20 text-gray-400"
                  }`}>
                    {c.status}
                  </span>
                </div>
                <div className="text-sm text-[var(--muted-foreground)] space-y-1 mb-4">
                  <p>Settore: {c.sector}</p>
                  {c.city && <p>Città: {c.city}</p>}
                  {c.region && <p>Regione: {c.region}</p>}
                  <p>Lead trovati: {c._count.leads}</p>
                </div>

                {/* Progress Bar */}
                {isActive && pct !== undefined && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-[var(--muted-foreground)]">Progresso</span>
                      <span className="font-mono font-semibold text-[var(--primary)]">{pct}%</span>
                    </div>
                    <div className="w-full h-2 bg-[var(--muted)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--primary)] rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleRunScraper(c.id)}
                    disabled={scraping === c.id}
                    className="flex-1 px-3 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 disabled:opacity-50 text-xs font-medium flex items-center justify-center gap-1"
                  >
                    {scraping === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                    {scraping === c.id ? "Scraping..." : "Avvia Scraping"}
                  </button>
                  <button
                    onClick={() => toggleStatus(c.id, c.status)}
                    className="px-3 py-2 bg-[var(--muted)] text-[var(--foreground)] rounded-lg hover:opacity-90 text-xs flex items-center gap-1"
                  >
                    {c.status === "active" ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    {c.status === "active" ? "Pausa" : "Riattiva"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Activity Log */}
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="w-5 h-5 text-[var(--muted-foreground)]" />
            Log Attività
            {selectedCampaign && (
              <span className="text-sm font-normal text-[var(--muted-foreground)]">
                — {campaigns.find((c) => c.id === selectedCampaign)?.name}
              </span>
            )}
          </h2>
          {selectedCampaign && (
            <button
              onClick={() => { setSelectedCampaign(null); fetchLogs(); }}
              className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              Mostra tutti
            </button>
          )}
        </div>

        {filteredLogs.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)] text-center py-8">
            Nessuna attività registrata. Avvia uno scraping per iniziare.
          </p>
        ) : (
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {filteredLogs.map((entry) => {
              const Icon = LOG_ICONS[entry.type] || ArrowRight;
              const isError = entry.type === "scrape_error";
              const isDone = entry.type === "scrape_done";
              return (
                <div
                  key={entry.id}
                  className={`flex items-start gap-3 px-3 py-2 rounded-lg text-sm ${
                    isError ? "bg-red-500/5" : isDone ? "bg-green-500/5" : "hover:bg-[var(--muted)]/50"
                  }`}
                >
                  <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                    isError ? "text-red-400" :
                    isDone ? "text-green-400" :
                    entry.type === "scrape_start" ? "text-blue-400" :
                    entry.type.startsWith("ai_") ? "text-purple-400" :
                    "text-[var(--muted-foreground)]"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className={`${isError ? "text-red-400" : isDone ? "text-green-400" : "text-[var(--foreground)]"}`}>
                      {entry.message}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-[var(--muted-foreground)]">{formatTime(entry.createdAt)}</span>
                      {!selectedCampaign && (
                        <span className="text-xs text-[var(--muted-foreground)]">• {entry.campaign.name}</span>
                      )}
                      {entry.progress !== null && (
                        <span className="text-xs font-mono text-[var(--primary)]">{entry.progress}%</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
