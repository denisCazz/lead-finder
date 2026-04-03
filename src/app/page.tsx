import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Clock3,
  Flame,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Radar,
  RefreshCw,
  ScrollText,
  Send,
  Settings,
  Sparkles,
  Terminal,
  Users,
  Workflow,
} from "lucide-react";

export const dynamic = "force-dynamic";

type DashboardLead = {
  id: number;
  companyName: string;
  sector: string | null;
  city: string | null;
  score: number;
  email: string | null;
  phone: string | null;
  analyses: {
    aiScore: number | null;
    suggestedService: string | null;
  }[];
  messages: {
    status: string;
    type: string;
  }[];
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function timeAgo(date: Date) {
  const diff = Date.now() - date.getTime();
  if (diff < 60000) return `${Math.floor(diff / 1000)}s fa`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m fa`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h fa`;
  return `${Math.floor(diff / 86400000)}g fa`;
}

function asPercent(value: number, total: number) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function messageState(lead: DashboardLead) {
  const message = lead.messages[0];
  if (!message) {
    if (lead.phone && !lead.email) return { label: "WhatsApp manuale", tone: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20" };
    if (!lead.email && !lead.phone) return { label: "Senza contatto", tone: "text-slate-300 bg-slate-500/10 border-slate-500/20" };
    return { label: "Nessun messaggio", tone: "text-slate-300 bg-slate-500/10 border-slate-500/20" };
  }
  if (message.status === "sent") return { label: "Email inviata", tone: "text-green-300 bg-green-500/10 border-green-500/20" };
  if (message.status === "failed") return { label: "Invio fallito", tone: "text-red-300 bg-red-500/10 border-red-500/20" };
  if (message.status === "draft") return { label: "Bozza pronta", tone: "text-amber-300 bg-amber-500/10 border-amber-500/20" };
  return { label: message.status, tone: "text-slate-300 bg-slate-500/10 border-slate-500/20" };
}

async function getDashboardData() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const week = new Date(today);
    week.setDate(week.getDate() - 7);

    const [settingsRows, counts, campaigns, logs, topLeads, outreachPreview, cityLogs, tokenLogs] = await Promise.all([
      prisma.setting.findMany({
        where: {
          key: { in: ["auto_send_enabled", "auto_send_min_score", "max_emails_per_day", "app_url", "email_from"] },
        },
      }),
      Promise.all([
        prisma.lead.count(),
        prisma.lead.count({ where: { createdAt: { gte: today } } }),
        prisma.lead.count({ where: { analyses: { some: {} } } }),
        prisma.lead.count({ where: { score: { gte: 75 } } }),
        prisma.lead.count({ where: { analyses: { none: {} } } }),
        prisma.lead.count({
          where: {
            OR: [
              { analyses: { none: {} } },
              { status: "analyzed", messages: { none: {} } },
              { status: "new" },
            ],
          },
        }),
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
        take: 10,
        include: {
          lead: { select: { id: true, companyName: true } },
          campaign: { select: { id: true, name: true } },
        },
      }),
      prisma.lead.findMany({
        where: { score: { gte: 75 } },
        orderBy: [{ score: "desc" }, { createdAt: "desc" }],
        take: 6,
        include: {
          analyses: { orderBy: { analyzedAt: "desc" }, take: 1, select: { aiScore: true, suggestedService: true } },
          messages: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, type: true } },
        },
      }),
      prisma.lead.findMany({
        where: {
          status: { notIn: ["contacted", "rejected"] },
          OR: [
            { phone: { not: null }, email: null },
            { email: { not: null }, messages: { some: { status: "draft" } } },
          ],
        },
        orderBy: [{ score: "desc" }, { createdAt: "desc" }],
        take: 6,
        include: {
          analyses: { orderBy: { analyzedAt: "desc" }, take: 1, select: { aiScore: true, suggestedService: true } },
          messages: { where: { status: "draft" }, orderBy: { createdAt: "desc" }, take: 1, select: { status: true, type: true } },
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
    ]);

    const settings = Object.fromEntries(settingsRows.map((row) => [row.key, row.value]));
    const [
      totalLeads,
      leadsToday,
      analyzedLeads,
      hotLeadCount,
      pendingAnalysisCount,
        backlogCount,
      draftEmailCount,
      sentTodayCount,
      failedEmailCount,
      outreachCount,
      errorCount,
    ] = counts;

    const weeklyTokens = tokenLogs.reduce((sum, log) => {
      try {
        const parsed = JSON.parse(log.metadata ?? "{}");
        return sum + (parsed.tokensUsed ?? 0);
      } catch {
        return sum;
      }
    }, 0);

    return {
      dbConnected: true,
      settings: {
        autoSendEnabled: settings.auto_send_enabled !== "false",
        minScore: parseInt(settings.auto_send_min_score || "70", 10),
        maxEmailsPerDay: parseInt(settings.max_emails_per_day || "20", 10),
        emailFrom: settings.email_from || process.env.EMAIL_FROM || "info@bitora.it",
      },
      metrics: {
        totalLeads,
        leadsToday,
        analyzedLeads,
        hotLeadCount,
        pendingAnalysisCount,
        draftEmailCount,
        sentTodayCount,
        failedEmailCount,
        outreachCount,
        errorCount,
        weeklyTokens,
      },
      campaigns,
      logs,
      topLeads: topLeads as DashboardLead[],
      outreachPreview: outreachPreview as DashboardLead[],
      cityLogs,
    };
  } catch {
    return {
      dbConnected: false,
      settings: { autoSendEnabled: false, minScore: 70, maxEmailsPerDay: 20, emailFrom: "info@bitora.it" },
      metrics: {
        totalLeads: 0,
        leadsToday: 0,
        analyzedLeads: 0,
        hotLeadCount: 0,
        pendingAnalysisCount: 0,
        backlogCount: 0,
        draftEmailCount: 0,
        sentTodayCount: 0,
        failedEmailCount: 0,
        outreachCount: 0,
        errorCount: 0,
        weeklyTokens: 0,
      },
      campaigns: [],
      logs: [],
      topLeads: [],
      outreachPreview: [],
      cityLogs: [],
    };
  }
}

function SectionCard({ title, description, action, children }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--foreground)]">{title}</h2>
          {description && <p className="mt-1 text-sm text-[var(--muted-foreground)]">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  const activeCampaigns = data.campaigns.filter((campaign) => campaign.status === "active").length;
  const completedCampaigns = data.campaigns.filter((campaign) => campaign.status === "completed").length;
  const deliveryRate = data.metrics.sentTodayCount + data.metrics.failedEmailCount > 0
    ? Math.round((data.metrics.sentTodayCount / (data.metrics.sentTodayCount + data.metrics.failedEmailCount)) * 100)
    : 100;

  const navigationCards = [
    { href: "/settings", icon: Settings, title: "Automazione", text: "Configura soglie, invio, webhook e settori." },
    { href: "/jobs", icon: Terminal, title: "Job manuali", text: "Lancia Automazione Completa o strumenti AI di supporto." },
    { href: "/logs", icon: ScrollText, title: "Log completi", text: "Controlla esiti, errori e attivita' recenti." },
    { href: "/outreach", icon: MessageCircle, title: "Outreach", text: "Gestisci WhatsApp manuali e code eccezioni." },
    { href: "/hot-leads", icon: Flame, title: "Hot leads", text: "Apri i lead con priorita' piu' alta e email inviate." },
    { href: "/leads", icon: Users, title: "Archivio lead", text: "Esplora tutti i lead trovati e il loro stato." },
    { href: "/messages", icon: MessageSquare, title: "Messaggi", text: "Monitora bozze, invii e storico email." },
    { href: "/usage", icon: BarChart3, title: "Utilizzo AI", text: "Verifica token, costi e volume generato." },
    { href: "/ai-campaign", icon: Workflow, title: "AI Campaign", text: "Verifica suggerimenti e pianificazione campagne." },
  ];

  const primaryCards = [
    { label: "Lead Totali", value: data.metrics.totalLeads, detail: `+${data.metrics.leadsToday} oggi`, icon: Users, tone: "text-sky-300 bg-sky-500/10 border-sky-500/20" },
    { label: "Hot Leads", value: data.metrics.hotLeadCount, detail: "score >= 75", icon: Flame, tone: "text-orange-300 bg-orange-500/10 border-orange-500/20" },
    { label: "Arretrato", value: data.metrics.backlogCount, detail: "lead ancora da scodare", icon: RefreshCw, tone: "text-indigo-300 bg-indigo-500/10 border-indigo-500/20" },
    { label: "Outreach Manuale", value: data.metrics.outreachCount, detail: "eccezioni aperte", icon: MessageCircle, tone: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20" },
    { label: "Email Oggi", value: data.metrics.sentTodayCount, detail: `${data.metrics.draftEmailCount} draft pronte`, icon: Send, tone: "text-green-300 bg-green-500/10 border-green-500/20" },
  ];

  const funnel = [
    { label: "Lead trovati", value: data.metrics.totalLeads, icon: Users },
    { label: "Analizzati", value: data.metrics.analyzedLeads, icon: Sparkles },
    { label: "Bozze email", value: data.metrics.draftEmailCount, icon: Mail },
    { label: "Email inviate oggi", value: data.metrics.sentTodayCount, icon: Send },
    { label: "Outreach manuale", value: data.metrics.outreachCount, icon: MessageCircle },
  ];

  return (
    <div className="space-y-6">
      {!data.dbConnected && (
        <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-yellow-200">
          <p className="font-medium">Database non raggiungibile</p>
          <p className="mt-1 text-sm text-yellow-200/80">La dashboard mostra solo fallback statici finche' il database non torna disponibile.</p>
        </div>
      )}

      <section className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.18),_transparent_28%),linear-gradient(180deg,_rgba(15,23,42,0.92),_rgba(15,23,42,0.98))] p-6 sm:p-8">
        <div className="grid gap-6 xl:grid-cols-[1.35fr_0.9fr] xl:items-stretch">
          <div className="max-w-3xl">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em] text-sky-200/80">
              <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1">Centro Operativo</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Bitora.it</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{formatDate(new Date())}</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Dashboard unificata lead, AI, outreach e automazioni</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">Stato reale della pipeline: cosa e' stato trovato, cosa e' stato analizzato, cosa e' pronto da inviare e dove serve ancora intervento manuale.</p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/settings" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-slate-900 transition hover:bg-slate-100">
                <Settings className="h-4 w-4" />
                Impostazioni
              </Link>
              <Link href="/jobs" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10">
                <Terminal className="h-4 w-4" />
                Lancia job
              </Link>
              <Link href="/logs" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10">
                <ScrollText className="h-4 w-4" />
                Apri log
              </Link>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-slate-400">Campagne attive</p>
                <p className="mt-1 text-2xl font-semibold text-white">{activeCampaigns}</p>
                <p className="mt-1 text-xs text-emerald-300">{completedCampaigns} completate</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-slate-400">Lead da analizzare</p>
                <p className="mt-1 text-2xl font-semibold text-white">{data.metrics.pendingAnalysisCount}</p>
                <p className="mt-1 text-xs text-amber-300">nuovi lead in coda AI</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-slate-400">Deliverability oggi</p>
                <p className="mt-1 text-2xl font-semibold text-white">{deliveryRate}%</p>
                <p className="mt-1 text-xs text-sky-300">{data.metrics.sentTodayCount} inviate, {data.metrics.failedEmailCount} failed</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Automazione</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Stato operativo</h2>
              </div>
              <Link href="/settings" className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10">
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              {[
                { label: "Ricerca clienti", value: "worker interno", state: "trova nuovi lead e aggiorna lo storico citta'", ok: true },
                { label: "Analisi clienti", value: "AI attiva", state: "diagnosi, qualifica e decisione invio per lead", ok: true },
                { label: "Invio mail", value: data.settings.autoSendEnabled ? "attivo" : "forzato dal loop", state: `cap debug ${data.settings.maxEmailsPerDay}/giorno`, ok: true },
                { label: "Mittente", value: data.settings.emailFrom, state: "configurazione attiva", ok: true },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950/30 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-300">{item.label}</p>
                    <p className="mt-1 truncate text-xs text-slate-400">{item.state}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-white">{item.value}</p>
                    <p className={`mt-1 text-xs ${item.ok ? "text-emerald-300" : "text-amber-300"}`}>{item.ok ? "ok" : "attenzione"}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {primaryCards.map((card) => (
          <div key={card.label} className={`rounded-2xl border p-5 ${card.tone}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{card.label}</p>
                <p className="mt-2 text-3xl font-bold text-white">{card.value}</p>
                <p className="mt-1 text-xs text-current/80">{card.detail}</p>
              </div>
              <card.icon className="h-8 w-8 shrink-0 opacity-80" />
            </div>
          </div>
        ))}
        <div className={`rounded-2xl border p-5 ${data.metrics.errorCount > 0 ? "text-red-300 bg-red-500/10 border-red-500/20" : "text-slate-300 bg-slate-500/10 border-slate-500/20"}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Errori Oggi</p>
              <p className="mt-2 text-3xl font-bold text-white">{data.metrics.errorCount}</p>
              <p className="mt-1 text-xs text-current/80">{data.metrics.failedEmailCount} invii falliti</p>
            </div>
            <Radar className="h-8 w-8 shrink-0 opacity-80" />
          </div>
        </div>
        <div className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/10 p-5 text-fuchsia-300">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Token 7 Giorni</p>
              <p className="mt-2 text-3xl font-bold text-white">{data.metrics.weeklyTokens.toLocaleString("it-IT")}</p>
              <p className="mt-1 text-xs text-current/80">consumo AI monitorato</p>
            </div>
            <Bot className="h-8 w-8 shrink-0 opacity-80" />
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <SectionCard title="Pipeline operativa" description="Conversione dal lead trovato all'invio o al passaggio in outreach manuale." action={<Link href="/usage" className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"><BarChart3 className="h-4 w-4" />Utilizzo AI</Link>}>
          <div className="mb-5 grid gap-3 lg:grid-cols-4">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/25 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Analisi AI</p>
              <p className="mt-2 text-2xl font-semibold">{data.metrics.analyzedLeads}</p>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">lead con scheda analitica completata</p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/25 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Bozze pronte</p>
              <p className="mt-2 text-2xl font-semibold">{data.metrics.draftEmailCount}</p>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">email in revisione oppure approvate dall&apos;AI</p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/25 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Invii oggi</p>
              <p className="mt-2 text-2xl font-semibold">{data.metrics.sentTodayCount}</p>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">spedizioni completate dal worker Invio Mail</p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/25 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Eccezioni</p>
              <p className="mt-2 text-2xl font-semibold">{data.metrics.outreachCount}</p>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">lead passati a revisione manuale</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {funnel.map((step, index) => (
              <div key={step.label} className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/35 p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <step.icon className="h-5 w-5 text-[var(--primary)]" />
                  <span className="text-xs text-[var(--muted-foreground)]">{index + 1}/5</span>
                </div>
                <p className="text-sm text-[var(--muted-foreground)]">{step.label}</p>
                <p className="mt-1 text-2xl font-semibold">{step.value}</p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--border)]">
                  <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${asPercent(step.value, Math.max(data.metrics.totalLeads, 1))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
          <SectionCard title="Comandi e pagine chiave" description="Azioni principali e accessi rapidi raccolti in un unico pannello.">
            <div className="mb-5 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/35 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">Configurazione sistema</p>
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">Gestisci automazioni, soglie, webhook e parametri del loop continuo.</p>
                  </div>
                  <Link href="/settings" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-medium text-[var(--primary-foreground)] transition hover:opacity-90">
                    <Settings className="h-4 w-4" />
                    Apri Settings
                  </Link>
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/35 p-4">
                <p className="text-sm font-medium">Azioni rapide</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  <Link href="/jobs" className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-medium transition hover:border-[var(--primary)]/40 hover:text-[var(--primary)]">
                    <Terminal className="h-4 w-4" />
                    Jobs
                  </Link>
                  <Link href="/logs" className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-medium transition hover:border-[var(--primary)]/40 hover:text-[var(--primary)]">
                    <ScrollText className="h-4 w-4" />
                    Log
                  </Link>
                  <Link href="/usage" className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-medium transition hover:border-[var(--primary)]/40 hover:text-[var(--primary)]">
                    <BarChart3 className="h-4 w-4" />
                    Utilizzo AI
                  </Link>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {navigationCards.map((action) => (
                <Link key={action.href} href={action.href} className="group rounded-2xl border border-[var(--border)] bg-[var(--muted)]/35 p-4 transition hover:border-[var(--primary)]/40 hover:bg-[var(--muted)]/60">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="mb-2 inline-flex rounded-lg bg-[var(--primary)]/10 p-2 text-[var(--primary)]">
                        <action.icon className="h-4 w-4" />
                      </div>
                      <p className="font-medium">{action.title}</p>
                      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{action.text}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition group-hover:text-[var(--foreground)]" />
                  </div>
                </Link>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Coda outreach manuale" description="Lead che richiedono intervento umano: solo telefono oppure email sotto soglia." action={<Link href="/outreach" className="text-sm text-[var(--primary)] hover:underline">Apri Outreach</Link>}>
            <div className="mb-5 grid gap-3 lg:grid-cols-3">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-emerald-200/80">In coda</p>
                <p className="mt-2 text-2xl font-semibold text-white">{data.metrics.outreachCount}</p>
                <p className="mt-1 text-sm text-emerald-100/80">lead che attendono un'azione manuale</p>
              </div>
              <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-sky-200/80">Solo telefono</p>
                <p className="mt-2 text-2xl font-semibold text-white">{data.outreachPreview.filter((lead) => lead.phone && !lead.email).length}</p>
                <p className="mt-1 text-sm text-sky-100/80">candidati WhatsApp o contatto diretto</p>
              </div>
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-amber-200/80">Bozze da rivedere</p>
                <p className="mt-2 text-2xl font-semibold text-white">{data.outreachPreview.filter((lead) => !!lead.email).length}</p>
                <p className="mt-1 text-sm text-amber-100/80">email presenti ma fuori dal flusso automatico</p>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {data.outreachPreview.map((lead) => {
                const latestAnalysis = lead.analyses[0];
                return (
                  <div key={lead.id} className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/35 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link href={`/leads/${lead.id}`} className="font-medium hover:text-[var(--primary)]">{lead.companyName}</Link>
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">{[lead.sector, lead.city].filter(Boolean).join(" • ") || "Lead senza dettagli completi"}</p>
                        <p className="mt-2 text-xs text-[var(--muted-foreground)]">{lead.phone ? `Telefono ${lead.phone}` : lead.email ? `Email ${lead.email}` : "Nessun contatto"}</p>
                      </div>
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-300">{lead.score}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--muted-foreground)]">
                      <span>{latestAnalysis?.suggestedService || "Servizio da definire"}</span>
                      <span>{lead.phone && !lead.email ? "WhatsApp" : "Revisione email"}</span>
                    </div>
                  </div>
                );
              })}
              {data.outreachPreview.length === 0 && (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200 lg:col-span-2">Nessuna eccezione aperta. La coda manuale e' vuota.</div>
              )}
            </div>
          </SectionCard>
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <SectionCard title="Hot leads pronti da chiudere" description="Lead ad alta priorita' con score alto e stato del messaggio piu' recente." action={<Link href="/hot-leads" className="text-sm text-[var(--primary)] hover:underline">Apri Hot Leads</Link>}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[var(--muted-foreground)]">
                    <th className="pb-3 font-medium">Lead</th>
                    <th className="pb-3 font-medium">Score</th>
                    <th className="pb-3 font-medium">AI</th>
                    <th className="pb-3 font-medium">Servizio</th>
                    <th className="pb-3 font-medium">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topLeads.map((lead) => {
                    const latestAnalysis = lead.analyses[0];
                    const state = messageState(lead);
                    return (
                      <tr key={lead.id} className="border-b border-[var(--border)] last:border-0">
                        <td className="py-3 pr-3">
                          <Link href={`/leads/${lead.id}`} className="font-medium text-[var(--foreground)] hover:text-[var(--primary)]">{lead.companyName}</Link>
                          <p className="mt-1 text-xs text-[var(--muted-foreground)]">{[lead.sector, lead.city].filter(Boolean).join(" • ") || "Settore o citta' mancanti"}</p>
                        </td>
                        <td className="py-3 pr-3"><span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-1 text-xs font-semibold text-orange-300">{lead.score}</span></td>
                        <td className="py-3 pr-3 text-[var(--muted-foreground)]">{latestAnalysis?.aiScore ?? "-"}</td>
                        <td className="py-3 pr-3 text-[var(--muted-foreground)]">{latestAnalysis?.suggestedService || "-"}</td>
                        <td className="py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-xs ${state.tone}`}>{state.label}</span></td>
                      </tr>
                    );
                  })}
                  {data.topLeads.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-[var(--muted-foreground)]">Nessun hot lead disponibile.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Radar campagne e citta'" description="Stato delle campagne attive e ultime citta' lavorate dal job notturno." action={<Link href="/jobs" className="text-sm text-[var(--primary)] hover:underline">Esegui job</Link>}>
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              {data.campaigns.map((campaign) => (
                <div key={campaign.id} className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/35 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{campaign.name}</p>
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">{[campaign.sector, campaign.city || campaign.region].filter(Boolean).join(" • ")}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${campaign.status === "active" ? "bg-green-500/10 text-green-300" : campaign.status === "completed" ? "bg-slate-500/10 text-slate-300" : "bg-amber-500/10 text-amber-300"}`}>{campaign.status}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                    <span>{campaign._count.leads} lead</span>
                    <span>{campaign._count.logs} log</span>
                  </div>
                </div>
              ))}
              {data.campaigns.length === 0 && (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/35 p-4 text-sm text-[var(--muted-foreground)]">Nessuna campagna disponibile.</div>
              )}
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/35 p-4">
              <div className="mb-3 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-[var(--primary)]" />
                <p className="text-sm font-medium">Ultime citta' lavorate</p>
              </div>
              <div className="space-y-2 text-sm">
                {data.cityLogs.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                    <div>
                      <p className="font-medium">{entry.city}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">{[entry.sector, entry.region].filter(Boolean).join(" • ")}</p>
                    </div>
                    <div className="text-right text-xs text-[var(--muted-foreground)]">
                      <p>{entry.leadsFound} lead</p>
                      <p>{timeAgo(entry.scrapedAt)}</p>
                    </div>
                  </div>
                ))}
                {data.cityLogs.length === 0 && <p className="text-[var(--muted-foreground)]">Nessuna citta' registrata ancora.</p>}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Attivita' recenti" description="Ultimi eventi di scraping, AI, invio e gestione manuale." action={<Link href="/logs" className="text-sm text-[var(--primary)] hover:underline">Apri log completi</Link>}>
          <div className="space-y-3">
            {data.logs.map((log) => {
              const isError = log.type.includes("error");
              const isSend = log.type === "send";
              return (
                <div key={log.id} className={`rounded-2xl border p-4 ${isError ? "border-red-500/20 bg-red-500/10" : isSend ? "border-blue-500/20 bg-blue-500/10" : "border-[var(--border)] bg-[var(--muted)]/35"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{log.message}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
                        <span>{formatDateTime(log.createdAt)}</span>
                        {log.campaign && <span>• {log.campaign.name}</span>}
                        {log.lead && <span>• {log.lead.companyName}</span>}
                        <span className="rounded-full border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 font-mono">{log.type}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                      <RefreshCw className="h-3.5 w-3.5" />
                      {timeAgo(log.createdAt)}
                    </div>
                  </div>
                </div>
              );
            })}
            {data.logs.length === 0 && <p className="text-[var(--muted-foreground)]">Nessuna attivita' disponibile.</p>}
          </div>
        </SectionCard>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1fr_1.1fr]">
        <SectionCard title="Stato automazione" description="Configurazione effettiva usata dai cron e dai trigger manuali.">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--muted)]/35 px-4 py-3">
              <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-[var(--primary)]" /><span>Invio automatico</span></div>
              <span className={`rounded-full px-2 py-1 text-xs font-medium ${data.settings.autoSendEnabled ? "bg-green-500/10 text-green-300" : "bg-amber-500/10 text-amber-300"}`}>{data.settings.autoSendEnabled ? "Attivo" : "Disattivato"}</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--muted)]/35 px-4 py-3"><span>Soglia auto-send</span><span className="font-medium">{data.settings.minScore}</span></div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--muted)]/35 px-4 py-3"><span>Cap giornaliero</span><span className="font-medium">{data.settings.maxEmailsPerDay}</span></div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/35 px-4 py-3"><p className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">Mittente email</p><p className="mt-1 font-medium">{data.settings.emailFrom}</p></div>
          </div>
        </SectionCard>

        <SectionCard title="Focus tecnico" description="Dove intervenire per aumentare automazione e resa.">
          <div className="space-y-3 text-sm text-[var(--muted-foreground)]">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/35 px-4 py-3"><p className="font-medium text-[var(--foreground)]">Lead da analizzare</p><p className="mt-1">{data.metrics.pendingAnalysisCount} lead ancora senza analisi.</p></div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/35 px-4 py-3"><p className="font-medium text-[var(--foreground)]">Invii falliti</p><p className="mt-1">{data.metrics.failedEmailCount} messaggi email con stato failed da recuperare.</p></div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/35 px-4 py-3"><p className="font-medium text-[var(--foreground)]">Coda manuale</p><p className="mt-1">{data.metrics.outreachCount} lead aspettano revisione o contatto WhatsApp.</p></div>
          </div>
        </SectionCard>

        <SectionCard title="Percorso consigliato" description="Uso quotidiano della piattaforma senza dispersione.">
          <ol className="space-y-3 text-sm text-[var(--muted-foreground)]">
            <li className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/35 px-4 py-3">1. Apri Settings per verificare soglie, cron e mittente email.</li>
            <li className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/35 px-4 py-3">2. Controlla questa dashboard per code, errori, hot leads e campagne.</li>
            <li className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/35 px-4 py-3">3. Se serve, lancia un job manuale e verifica gli esiti nei Log.</li>
          </ol>
        </SectionCard>
      </section>
    </div>
  );
}
