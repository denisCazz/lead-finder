"use client";

import { useState, useEffect } from "react";
import { BarChart3, Zap, Mail, MessageCircle, Users, TrendingUp, RefreshCw } from "lucide-react";

interface UsageData {
  summary: { tokens: { today: number; week: number; month: number }; costEur: { today: number; week: number; month: number } };
  emails: { today: number; week: number; month: number };
  whatsappDrafts: { today: number; week: number; month: number };
  leads: { today: number; week: number; month: number };
  history: { id: number; type: string; message: string; companyName: string | null; tokens: number; costEur: number; createdAt: string }[];
}

const TYPE_LABELS: Record<string, string> = { ai_analysis: "Diagnosi AI", ai_generate: "Generazione", ai_city_suggestion: "Suggerimento", send: "Invio email" };
const TYPE_BADGES: Record<string, string> = { ai_analysis: "badge-purple", ai_generate: "badge-blue", ai_city_suggestion: "badge-yellow", send: "badge-green" };

export default function UsagePage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"today" | "week" | "month">("week");

  async function load() { setLoading(true); const res = await fetch("/api/usage"); setData(await res.json()); setLoading(false); }
  useEffect(() => { load(); }, []);

  if (loading || !data) return <div className="empty-state"><p>{loading ? "Caricamento..." : "Errore"}</p></div>;

  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
  const eur = (n: number) => n < 0.01 ? "< €0.01" : `€${n.toFixed(2)}`;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"><BarChart3 className="w-6 h-6 text-[var(--primary)]" /> Utilizzo & Consumi</h1>
          <p className="page-subtitle">Token AI, email, WhatsApp e costi</p>
        </div>
        <button onClick={load} className="btn btn-outline"><RefreshCw className="w-4 h-4" /> Aggiorna</button>
      </div>

      <div className="tab-bar w-fit mb-6">
        {(["today", "week", "month"] as const).map((t) => (
          <button key={t} onClick={() => setPeriod(t)} className={`tab-btn ${period === t ? "tab-btn-active" : ""}`}>
            {t === "today" ? "Oggi" : t === "week" ? "7 giorni" : "30 giorni"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Token usati", value: fmt(data.summary.tokens[period]), icon: Zap, color: "text-yellow-400" },
          { label: "Costo", value: eur(data.summary.costEur[period]), icon: TrendingUp, color: "text-blue-400" },
          { label: "Email inviate", value: String(data.emails[period]), icon: Mail, color: "text-emerald-400" },
          { label: "Lead trovati", value: String(data.leads[period]), icon: Users, color: "text-purple-400" },
        ].map((c) => (
          <div key={c.label} className="kpi-card text-center">
            <c.icon className={`w-5 h-5 mx-auto mb-2 ${c.color}`} />
            <p className={`kpi-value ${c.color}`}>{c.value}</p>
            <p className="kpi-label mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        {[
          { label: "Token OpenAI", icon: Zap, color: "text-yellow-400", today: fmt(data.summary.tokens.today), week: fmt(data.summary.tokens.week), month: fmt(data.summary.tokens.month) },
          { label: "Costo (€)", icon: TrendingUp, color: "text-blue-400", today: eur(data.summary.costEur.today), week: eur(data.summary.costEur.week), month: eur(data.summary.costEur.month) },
          { label: "Email inviate", icon: Mail, color: "text-emerald-400", today: String(data.emails.today), week: String(data.emails.week), month: String(data.emails.month) },
          { label: "WhatsApp generati", icon: MessageCircle, color: "text-sky-400", today: String(data.whatsappDrafts.today), week: String(data.whatsappDrafts.week), month: String(data.whatsappDrafts.month) },
        ].map((c) => (
          <div key={c.label} className="section-card">
            <div className="flex items-center gap-2 mb-3"><c.icon className={`w-4 h-4 ${c.color}`} /><span className="font-medium text-sm">{c.label}</span></div>
            <div className="grid grid-cols-3 gap-3">
              {[{ l: "Oggi", v: c.today }, { l: "7g", v: c.week }, { l: "30g", v: c.month }].map((i) => (
                <div key={i.l} className="text-center"><p className="text-lg font-bold">{i.v}</p><p className="text-xs text-[var(--muted-foreground)]">{i.l}</p></div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="table-wrap">
        <div className="px-4 py-3 border-b border-[var(--border)]"><h2 className="font-semibold text-sm">Attività recenti</h2></div>
        <table>
          <thead><tr><th>Data</th><th>Tipo</th><th>Azienda</th><th className="text-right">Token</th><th className="text-right">Costo</th></tr></thead>
          <tbody>
            {data.history.map((log) => (
              <tr key={log.id}>
                <td className="text-[var(--muted-foreground)] whitespace-nowrap text-sm">{new Date(log.createdAt).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                <td><span className={`badge ${TYPE_BADGES[log.type] || "badge-gray"}`}>{TYPE_LABELS[log.type] || log.type}</span></td>
                <td className="max-w-xs truncate">{log.companyName || <span className="text-[var(--muted-foreground)]">—</span>}</td>
                <td className="text-right text-[var(--muted-foreground)]">{log.tokens > 0 ? fmt(log.tokens) : "—"}</td>
                <td className="text-right text-[var(--muted-foreground)]">{log.costEur > 0 ? eur(log.costEur) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
