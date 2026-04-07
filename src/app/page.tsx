import Link from "next/link";
import { prisma } from "@/lib/db";
import { BackfillButton } from "@/components/BackfillButton";
import {
  ArrowRight,
  Bot,
  Flame,
  Mail,
  MapPin,
  MessageCircle,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
  Terminal,
  Users,
  Zap,
} from "lucide-react";

export const dynamic = "force-dynamic";

function timeAgo(date: Date) {
  const diff = Date.now() - date.getTime();
  if (diff < 60000) return `${Math.floor(diff / 1000)}s fa`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m fa`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h fa`;
  return `${Math.floor(diff / 86400000)}g fa`;
}

async function getDashboardData() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const week = new Date(today);
    week.setDate(week.getDate() - 7);

    const [settingsRows, counts, campaigns, logs, topLeads, cityLogs, tokenLogs, lastBackfill] = await Promise.all([
      prisma.setting.findMany({
        where: { key: { in: ["auto_send_enabled", "max_emails_per_day", "max_whatsapp_per_day", "email_from"] } },
      }),
      Promise.all([
        prisma.lead.count(),
        prisma.lead.count({ where: { createdAt: { gte: today } } }),
        prisma.lead.count({ where: { analyses: { some: {} } } }),
        prisma.lead.count({ where: { score: { gte: 75 } } }),
        prisma.lead.count({ where: { analyses: { none: {} } } }),
        prisma.message.count({ where: { type: "email", status: "draft" } }),
        prisma.message.count({ where: { type: "email", status: "sent", sentAt: { gte: today } } }),
        prisma.message.count({ where: { type: "email", status: "failed" } }),
        prisma.lead.count({
          where: {
            status: { notIn: ["contacted", "rejected"] },
            OR: [
              { phone: { not: null }, email: null },
              { email: { not: null }, messages: { some: { status: "draft" } } },
            ],
          },
        }),
        prisma.activityLog.count({ where: { type: { contains: "error" }, createdAt: { gte: today } } }),
      ]),
      prisma.campaign.findMany({
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        take: 4,
        include: { _count: { select: { leads: true, logs: true } } },
      }),
      prisma.activityLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        include: {
          lead: { select: { id: true, companyName: true } },
          campaign: { select: { id: true, name: true } },
        },
      }),
      prisma.lead.findMany({
        where: { score: { gte: 75 } },
        orderBy: [{ score: "desc" }, { createdAt: "desc" }],
        take: 5,
        include: {
          analyses: { orderBy: { analyzedAt: "desc" }, take: 1, select: { aiScore: true, suggestedService: true } },
          messages: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, type: true } },
        },
      }),
      prisma.cityLog.findMany({ orderBy: { scrapedAt: "desc" }, take: 5 }),
      prisma.activityLog.findMany({
        where: {
          type: { in: ["ai_generate", "ai_city_suggestion", "ai_analysis"] },
          createdAt: { gte: week },
          metadata: { not: null },
        },
        select: { metadata: true },
      }),
      prisma.activityLog.findFirst({
        where: { type: "backfill" },
        orderBy: { createdAt: "desc" },
        select: { message: true, createdAt: true },
      }),
    ]);

    const settings = Object.fromEntries(settingsRows.map((row) => [row.key, row.value]));
    const [totalLeads, leadsToday, analyzedLeads, hotLeadCount, pendingAnalysisCount, draftEmailCount, sentTodayCount, failedEmailCount, outreachCount, errorCount] = counts;

    const weeklyTokens = tokenLogs.reduce((sum, log) => {
      try {
        const parsed = JSON.parse(log.metadata ?? "{}");
        return sum + (parsed.tokensUsed ?? 0);
      } catch { return sum; }
    }, 0);

    return {
      dbConnected: true,
      lastBackfill,
      settings: {
        autoSendEnabled: settings.auto_send_enabled !== "false",
        maxEmailsPerDay: parseInt(settings.max_emails_per_day || "100", 10),
        maxWhatsAppPerDay: parseInt(settings.max_whatsapp_per_day || "100", 10),
        emailFrom: settings.email_from || process.env.EMAIL_FROM || "info@bitora.it",
      },
      metrics: { totalLeads, leadsToday, analyzedLeads, hotLeadCount, pendingAnalysisCount, draftEmailCount, sentTodayCount, failedEmailCount, outreachCount, errorCount, weeklyTokens },
      campaigns,
      logs,
      topLeads,
      cityLogs,
    };
  } catch {
    return {
      dbConnected: false,
      lastBackfill: null,
      settings: { autoSendEnabled: false, maxEmailsPerDay: 100, maxWhatsAppPerDay: 100, emailFrom: "info@bitora.it" },
      metrics: { totalLeads: 0, leadsToday: 0, analyzedLeads: 0, hotLeadCount: 0, pendingAnalysisCount: 0, draftEmailCount: 0, sentTodayCount: 0, failedEmailCount: 0, outreachCount: 0, errorCount: 0, weeklyTokens: 0 },
      campaigns: [],
      logs: [],
      topLeads: [],
      cityLogs: [],
    };
  }
}

export default async function DashboardPage() {
  const d = await getDashboardData();
  const activeCampaigns = d.campaigns.filter((c) => c.status === "active").length;

  const kpis = [
    { label: "Lead Totali", value: d.metrics.totalLeads, detail: `+${d.metrics.leadsToday} oggi`, color: "text-indigo-400" },
    { label: "Hot Leads", value: d.metrics.hotLeadCount, detail: "score ≥ 75", color: "text-orange-400" },
    { label: "Email Oggi", value: d.metrics.sentTodayCount, detail: `${d.metrics.draftEmailCount} bozze`, color: "text-emerald-400" },
    { label: "Outreach", value: d.metrics.outreachCount, detail: "manuale", color: "text-sky-400" },
    { label: "Da Analizzare", value: d.metrics.pendingAnalysisCount, detail: "in coda AI", color: "text-amber-400" },
    { label: "Errori", value: d.metrics.errorCount, detail: `${d.metrics.failedEmailCount} falliti`, color: d.metrics.errorCount > 0 ? "text-red-400" : "text-slate-400" },
  ];

  const quickLinks = [
    { href: "/settings", icon: Settings, label: "Impostazioni" },
    { href: "/jobs", icon: Terminal, label: "Esegui Job" },
    { href: "/hot-leads", icon: Flame, label: "Hot Leads" },
    { href: "/outreach", icon: MessageCircle, label: "Outreach" },
    { href: "/messages", icon: Mail, label: "Messaggi" },
    { href: "/leads", icon: Users, label: "Archivio" },
  ];

  return (
    <div className="space-y-6">
      {!d.dbConnected && (
        <div className="section-card border-amber-500/30 bg-amber-500/10 text-amber-200">
          <p className="font-semibold">Database non raggiungibile</p>
          <p className="text-sm mt-1 opacity-80">La dashboard mostra dati fallback.</p>
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="kpi-card">
            <p className="kpi-label">{k.label}</p>
            <p className={`kpi-value ${k.color}`}>{k.value}</p>
            <p className="kpi-detail">{k.detail}</p>
          </div>
        ))}
      </div>

      {/* Status Row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="section-card">
          <p className="section-title"><Zap className="w-4 h-4 text-[var(--primary)]" /> Stato Automazione</p>
          <div className="space-y-2">
            {[
              { label: "Invio email", value: d.settings.autoSendEnabled ? "Attivo" : "Off", ok: d.settings.autoSendEnabled },
              { label: "Cap email/giorno", value: String(d.settings.maxEmailsPerDay), ok: true },
              { label: "Cap WhatsApp/giorno", value: String(d.settings.maxWhatsAppPerDay), ok: true },
              { label: "Campagne attive", value: String(activeCampaigns), ok: activeCampaigns > 0 },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-[var(--muted-foreground)]">{row.label}</span>
                <span className={row.ok ? "text-emerald-400 font-medium" : "text-amber-400 font-medium"}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="section-card">
          <p className="section-title"><Sparkles className="w-4 h-4 text-amber-400" /> Pipeline</p>
          <div className="space-y-2.5">
            {[
              { label: "Trovati", value: d.metrics.totalLeads, pct: 100 },
              { label: "Analizzati", value: d.metrics.analyzedLeads, pct: d.metrics.totalLeads ? Math.round((d.metrics.analyzedLeads / d.metrics.totalLeads) * 100) : 0 },
              { label: "Bozze email", value: d.metrics.draftEmailCount, pct: d.metrics.totalLeads ? Math.round((d.metrics.draftEmailCount / d.metrics.totalLeads) * 100) : 0 },
              { label: "Inviati oggi", value: d.metrics.sentTodayCount, pct: d.metrics.totalLeads ? Math.round((d.metrics.sentTodayCount / d.metrics.totalLeads) * 100) : 0 },
            ].map((step) => (
              <div key={step.label}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-[var(--muted-foreground)]">{step.label}</span>
                  <span className="font-medium">{step.value}</span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--muted)]">
                  <div className="h-full rounded-full bg-[var(--primary)] transition-all" style={{ width: `${Math.min(step.pct, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="section-card flex flex-col justify-between gap-4">
          <div>
            <p className="section-title"><Bot className="w-4 h-4 text-purple-400" /> AI Consumo 7g</p>
            <p className="text-3xl font-bold text-white mt-2">
              {d.metrics.weeklyTokens > 999 ? `${(d.metrics.weeklyTokens / 1000).toFixed(1)}k` : d.metrics.weeklyTokens}
            </p>
            <p className="text-sm text-[var(--muted-foreground)] mt-1">token utilizzati</p>
          </div>
          <BackfillButton lastLog={d.lastBackfill} />
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="section-card flex items-center gap-3 px-4 py-3 hover:border-[var(--primary)]/40 transition-all group"
          >
            <link.icon className="w-4 h-4 text-[var(--primary)] shrink-0" />
            <span className="text-sm font-medium truncate">{link.label}</span>
            <ArrowRight className="w-3.5 h-3.5 ml-auto text-[var(--muted-foreground)] group-hover:text-[var(--foreground)] shrink-0 transition-colors" />
          </Link>
        ))}
      </div>

      {/* Hot Leads + Activity */}
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="section-card">
          <div className="flex items-center justify-between mb-4">
            <p className="section-title mb-0"><Flame className="w-4 h-4 text-orange-400" /> Hot Leads</p>
            <Link href="/hot-leads" className="text-sm text-[var(--primary)] hover:underline">Vedi tutti</Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Score</th>
                  <th>Servizio</th>
                  <th>Stato</th>
                </tr>
              </thead>
              <tbody>
                {d.topLeads.map((lead) => {
                  const analysis = lead.analyses?.[0];
                  const msg = lead.messages?.[0];
                  return (
                    <tr key={lead.id}>
                      <td>
                        <Link href={`/leads/${lead.id}`} className="font-medium text-[var(--foreground)] hover:text-[var(--primary)]">{lead.companyName}</Link>
                        <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{[lead.sector, lead.city].filter(Boolean).join(" · ")}</p>
                      </td>
                      <td><span className="badge badge-orange">{lead.score}</span></td>
                      <td className="text-[var(--muted-foreground)] text-sm">{analysis?.suggestedService || "—"}</td>
                      <td>
                        {msg ? (
                          <span className={`badge ${msg.status === "sent" ? "badge-green" : msg.status === "draft" ? "badge-yellow" : "badge-gray"}`}>{msg.status}</span>
                        ) : (
                          <span className="badge badge-gray">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {d.topLeads.length === 0 && (
                  <tr><td colSpan={4} className="text-center py-8 text-[var(--muted-foreground)]">Nessun hot lead</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="section-card">
          <div className="flex items-center justify-between mb-4">
            <p className="section-title mb-0"><RefreshCw className="w-4 h-4 text-sky-400" /> Attività recenti</p>
            <Link href="/logs" className="text-sm text-[var(--primary)] hover:underline">Tutti i log</Link>
          </div>
          <div className="space-y-2">
            {d.logs.map((log) => {
              const isError = log.type.includes("error");
              return (
                <div key={log.id} className={`rounded-lg px-3 py-2.5 text-sm ${isError ? "bg-red-500/10 border border-red-500/20" : "bg-[var(--muted)]"}`}>
                  <p className="line-clamp-2 text-[var(--foreground)]">{log.message}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-[var(--muted-foreground)]">
                    <span>{timeAgo(log.createdAt)}</span>
                    <span className="badge badge-gray">{log.type}</span>
                  </div>
                </div>
              );
            })}
            {d.logs.length === 0 && <p className="text-[var(--muted-foreground)] text-sm">Nessuna attività recente</p>}
          </div>
        </div>
      </div>

      {/* Campaigns + Cities */}
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="section-card">
          <div className="flex items-center justify-between mb-4">
            <p className="section-title mb-0"><Zap className="w-4 h-4 text-[var(--primary)]" /> Campagne</p>
            <Link href="/campaigns" className="text-sm text-[var(--primary)] hover:underline">Tutte</Link>
          </div>
          <div className="space-y-2">
            {d.campaigns.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg bg-[var(--muted)] px-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{c.name}</p>
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{[c.sector, c.city || c.region].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex items-center gap-3 text-xs shrink-0">
                  <span className="text-[var(--muted-foreground)]">{c._count.leads} lead</span>
                  <span className={`badge ${c.status === "active" ? "badge-green" : c.status === "completed" ? "badge-gray" : "badge-yellow"}`}>{c.status}</span>
                </div>
              </div>
            ))}
            {d.campaigns.length === 0 && <p className="text-[var(--muted-foreground)] text-sm">Nessuna campagna</p>}
          </div>
        </div>

        <div className="section-card">
          <p className="section-title"><MapPin className="w-4 h-4 text-emerald-400" /> Ultime città lavorate</p>
          <div className="space-y-2">
            {d.cityLogs.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between rounded-lg bg-[var(--muted)] px-3 py-2.5 text-sm">
                <div>
                  <p className="font-medium">{entry.city}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">{[entry.sector, entry.region].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="text-right text-xs text-[var(--muted-foreground)]">
                  <p>{entry.leadsFound} lead</p>
                  <p>{timeAgo(entry.scrapedAt)}</p>
                </div>
              </div>
            ))}
            {d.cityLogs.length === 0 && <p className="text-[var(--muted-foreground)] text-sm">Nessuna città registrata</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
