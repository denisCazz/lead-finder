import { prisma } from "@/lib/db";
import {
  Users,
  Search,
  MessageSquare,
  Send,
  TrendingUp,
  Clock,
} from "lucide-react";

export const dynamic = "force-dynamic";

async function getStats() {
  try {
    const [totalLeads, analyzedLeads, totalMessages, sentMessages, recentLeads] =
      await Promise.all([
        prisma.lead.count(),
        prisma.lead.count({ where: { status: "analyzed" } }),
        prisma.message.count(),
        prisma.message.count({ where: { status: "sent" } }),
        prisma.lead.findMany({
          orderBy: { createdAt: "desc" },
          take: 10,
          include: {
            analyses: { take: 1, orderBy: { analyzedAt: "desc" } },
            messages: { take: 1, orderBy: { createdAt: "desc" } },
          },
        }),
      ]);

    return { totalLeads, analyzedLeads, totalMessages, sentMessages, recentLeads, dbConnected: true };
  } catch {
    return { totalLeads: 0, analyzedLeads: 0, totalMessages: 0, sentMessages: 0, recentLeads: [], dbConnected: false };
  }
}

export default async function DashboardPage() {
  const stats = await getStats();

  const cards = [
    { label: "Lead Totali", value: stats.totalLeads, icon: Users, color: "text-blue-400" },
    { label: "Analizzati", value: stats.analyzedLeads, icon: Search, color: "text-green-400" },
    { label: "Messaggi", value: stats.totalMessages, icon: MessageSquare, color: "text-yellow-400" },
    { label: "Inviati", value: stats.sentMessages, icon: Send, color: "text-purple-400" },
  ];

  return (
    <div>
      {!stats.dbConnected && (
        <div className="mb-6 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400">
          <p className="font-medium">⚠️ Database non raggiungibile</p>
          <p className="text-sm mt-1 text-yellow-400/80">
            Configura <code className="bg-yellow-500/10 px-1 rounded">DATABASE_URL</code> nel file <code className="bg-yellow-500/10 px-1 rounded">.env</code> e avvia MySQL, poi esegui <code className="bg-yellow-500/10 px-1 rounded">npx prisma db push</code>
          </p>
        </div>
      )}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-[var(--muted-foreground)] mt-1">
            Panoramica del sistema di lead generation
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
          <Clock className="w-4 h-4" />
          {new Date().toLocaleDateString("it-IT", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[var(--muted-foreground)]">{card.label}</p>
                <p className="text-3xl font-bold mt-1">{card.value}</p>
              </div>
              <card.icon className={`w-8 h-8 ${card.color} opacity-80`} />
            </div>
          </div>
        ))}
      </div>

      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-[var(--primary)]" />
          Funnel di Conversione
        </h2>
        <div className="flex items-center gap-4">
          {[
            { label: "Trovati", value: stats.totalLeads, pct: 100 },
            { label: "Analizzati", value: stats.analyzedLeads, pct: stats.totalLeads ? Math.round((stats.analyzedLeads / stats.totalLeads) * 100) : 0 },
            { label: "Messaggi", value: stats.totalMessages, pct: stats.totalLeads ? Math.round((stats.totalMessages / stats.totalLeads) * 100) : 0 },
            { label: "Inviati", value: stats.sentMessages, pct: stats.totalMessages ? Math.round((stats.sentMessages / stats.totalMessages) * 100) : 0 },
          ].map((step, i) => (
            <div key={step.label} className="flex-1">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-[var(--muted-foreground)]">{step.label}</span>
                    <span className="font-medium">{step.value}</span>
                  </div>
                  <div className="h-2 bg-[var(--muted)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--primary)] rounded-full transition-all"
                      style={{ width: `${step.pct}%` }}
                    />
                  </div>
                </div>
                {i < 3 && <span className="text-[var(--muted-foreground)]">&rarr;</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
        <h2 className="text-lg font-semibold mb-4">Lead Recenti</h2>
        {stats.recentLeads.length === 0 ? (
          <p className="text-[var(--muted-foreground)] text-center py-8">
            Nessun lead trovato. Crea una campagna per iniziare!
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--muted-foreground)] border-b border-[var(--border)]">
                  <th className="pb-3 font-medium">Azienda</th>
                  <th className="pb-3 font-medium">Settore</th>
                  <th className="pb-3 font-medium">Città</th>
                  <th className="pb-3 font-medium">Score</th>
                  <th className="pb-3 font-medium">Stato</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentLeads.map((lead) => (
                  <tr key={lead.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-3">
                      <a href={`/leads/${lead.id}`} className="text-[var(--primary)] hover:underline font-medium">
                        {lead.companyName}
                      </a>
                    </td>
                    <td className="py-3 text-[var(--muted-foreground)]">{lead.sector || "\u2014"}</td>
                    <td className="py-3 text-[var(--muted-foreground)]">{lead.city || "\u2014"}</td>
                    <td className="py-3">
                      <span className={`font-medium ${
                        lead.score >= 70 ? "text-red-400" : lead.score >= 40 ? "text-yellow-400" : "text-green-400"
                      }`}>
                        {lead.score}/100
                      </span>
                    </td>
                    <td className="py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        lead.status === "new" ? "bg-blue-500/20 text-blue-400" :
                        lead.status === "analyzed" ? "bg-yellow-500/20 text-yellow-400" :
                        lead.status === "contacted" ? "bg-green-500/20 text-green-400" :
                        "bg-gray-500/20 text-gray-400"
                      }`}>
                        {lead.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
