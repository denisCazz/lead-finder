"use client";

import { useState, useEffect } from "react";
import {
  BarChart3,
  Zap,
  Mail,
  MessageCircle,
  Users,
  TrendingUp,
  RefreshCw,
} from "lucide-react";

interface UsageData {
  summary: {
    tokens: { today: number; week: number; month: number };
    costEur: { today: number; week: number; month: number };
  };
  emails: { today: number; week: number; month: number };
  whatsappDrafts: { today: number; week: number; month: number };
  leads: { today: number; week: number; month: number };
  history: {
    id: number;
    type: string;
    message: string;
    companyName: string | null;
    tokens: number;
    costEur: number;
    createdAt: string;
  }[];
}

function StatCard({
  icon: Icon,
  label,
  today,
  week,
  month,
  format = (n: number) => n.toLocaleString("it-IT"),
  color = "text-[var(--primary)]",
}: {
  icon: React.ElementType;
  label: string;
  today: number;
  week: number;
  month: number;
  format?: (n: number) => string;
  color?: string;
}) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className={`w-5 h-5 ${color}`} />
        <span className="font-semibold text-sm">{label}</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[{ label: "Oggi", value: today }, { label: "7 giorni", value: week }, { label: "30 giorni", value: month }].map((item) => (
          <div key={item.label} className="text-center">
            <div className="text-xl font-bold">{format(item.value)}</div>
            <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const TYPE_LABELS: Record<string, string> = {
  ai_analysis: "Diagnosi AI",
  ai_generate: "Generazione testo",
  ai_city_suggestion: "Suggerimento città",
  send: "Email inviata",
};

const TYPE_COLORS: Record<string, string> = {
  ai_analysis: "text-purple-400",
  ai_generate: "text-blue-400",
  ai_city_suggestion: "text-yellow-400",
  send: "text-green-400",
};

export default function UsagePage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodTab, setPeriodTab] = useState<"today" | "week" | "month">("week");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/usage");
    setData(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  if (loading || !data) {
    return (
      <div className="text-center py-16 text-[var(--muted-foreground)]">
        {loading ? "Caricamento..." : "Errore nel caricamento dati"}
      </div>
    );
  }

  const formatEur = (n: number) =>
    n < 0.01 ? "< €0.01" : `€${n.toFixed(2)}`;

  const formatTokens = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <BarChart3 className="w-7 h-7 sm:w-8 sm:h-8 text-[var(--primary)]" />
            Utilizzo & Consumi
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Token AI, email inviate, messaggi WhatsApp e costi stimati
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--muted)] hover:bg-[var(--border)] text-sm"
        >
          <RefreshCw className="w-4 h-4" /> Aggiorna
        </button>
      </div>

      {/* Period tabs */}
      <div className="flex gap-1 mb-6 bg-[var(--muted)] rounded-lg p-1 w-fit">
        {(["today", "week", "month"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setPeriodTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              periodTab === t
                ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            {t === "today" ? "Oggi" : t === "week" ? "7 giorni" : "30 giorni"}
          </button>
        ))}
      </div>

      {/* Summary highlight */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Token usati", value: formatTokens(data.summary.tokens[periodTab]), icon: Zap, color: "text-yellow-400" },
          { label: "Costo stimato", value: formatEur(data.summary.costEur[periodTab]), icon: TrendingUp, color: "text-blue-400" },
          { label: "Email inviate", value: String(data.emails[periodTab]), icon: Mail, color: "text-green-400" },
          { label: "Lead trovati", value: String(data.leads[periodTab]), icon: Users, color: "text-purple-400" },
        ].map((card) => (
          <div key={card.label} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 text-center">
            <card.icon className={`w-6 h-6 mx-auto mb-2 ${card.color}`} />
            <div className="text-2xl font-bold">{card.value}</div>
            <div className="text-xs text-[var(--muted-foreground)] mt-1">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Detail cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <StatCard
          icon={Zap}
          label="Token OpenAI (GPT-4o)"
          today={data.summary.tokens.today}
          week={data.summary.tokens.week}
          month={data.summary.tokens.month}
          format={formatTokens}
          color="text-yellow-400"
        />
        <StatCard
          icon={TrendingUp}
          label="Costo stimato (€)"
          today={data.summary.costEur.today}
          week={data.summary.costEur.week}
          month={data.summary.costEur.month}
          format={formatEur}
          color="text-blue-400"
        />
        <StatCard
          icon={Mail}
          label="Email inviate"
          today={data.emails.today}
          week={data.emails.week}
          month={data.emails.month}
          color="text-green-400"
        />
        <StatCard
          icon={MessageCircle}
          label="Testi WhatsApp generati"
          today={data.whatsappDrafts.today}
          week={data.whatsappDrafts.week}
          month={data.whatsappDrafts.month}
          color="text-emerald-400"
        />
      </div>

      {/* History table */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h2 className="font-semibold">Attività recenti (ultimi 50)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)] text-xs uppercase">
                <th className="text-left px-5 py-3">Data</th>
                <th className="text-left px-5 py-3">Tipo</th>
                <th className="text-left px-5 py-3">Azienda</th>
                <th className="text-right px-5 py-3">Token</th>
                <th className="text-right px-5 py-3">Costo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {data.history.map((log) => (
                <tr key={log.id} className="hover:bg-[var(--muted)]/50 transition-colors">
                  <td className="px-5 py-3 text-[var(--muted-foreground)] whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleDateString("it-IT", {
                      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                    })}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <span className={`font-medium ${TYPE_COLORS[log.type] || "text-[var(--foreground)]"}`}>
                      {TYPE_LABELS[log.type] || log.type}
                    </span>
                  </td>
                  <td className="px-5 py-3 max-w-xs truncate text-[var(--foreground)]">
                    {log.companyName || <span className="text-[var(--muted-foreground)] italic">—</span>}
                  </td>
                  <td className="px-5 py-3 text-right text-[var(--muted-foreground)]">
                    {log.tokens > 0 ? formatTokens(log.tokens) : "—"}
                  </td>
                  <td className="px-5 py-3 text-right text-[var(--muted-foreground)]">
                    {log.tokens > 0 ? formatEur(log.costEur) : "—"}
                  </td>
                </tr>
              ))}
              {data.history.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-[var(--muted-foreground)]">
                    Nessuna attività registrata
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
