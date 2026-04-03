"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Flame,
  ExternalLink,
  Mail,
  Phone,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";

interface Message {
  id: number;
  type: string;
  status: string;
  subject: string | null;
  sentAt: string | null;
}

interface HotLead {
  id: number;
  companyName: string;
  sector: string | null;
  city: string | null;
  region: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  score: number;
  status: string;
  createdAt: string;
  aiScore: number | null;
  suggestedService: string | null;
  issues: string[];
  performanceScore: number | null;
  message: Message | null;
  emailSent: boolean;
  whatsappReady: boolean;
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 85 ? "bg-red-500/20 text-red-400 border-red-500/30" :
    score >= 75 ? "bg-orange-500/20 text-orange-400 border-orange-500/30" :
    "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${color}`}>
      {score}
    </span>
  );
}

function MessageStatus({ lead }: { lead: HotLead }) {
  if (lead.emailSent) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-green-400">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>Email inviata {lead.message?.sentAt ? new Date(lead.message.sentAt).toLocaleDateString("it-IT") : ""}</span>
      </div>
    );
  }
  if (lead.message?.status === "draft") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-yellow-400">
        <Clock className="w-3.5 h-3.5" />
        <span>Bozza pronta ({lead.message.type})</span>
      </div>
    );
  }
  if (!lead.email && !lead.phone) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
        <AlertCircle className="w-3.5 h-3.5" />
        <span>Nessun contatto</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
      <Clock className="w-3.5 h-3.5" />
      <span>In attesa di testo</span>
    </div>
  );
}

export default function HotLeadsPage() {
  const [leads, setLeads] = useState<HotLead[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [minScore, setMinScore] = useState(75);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/hot-leads?minScore=${minScore}&page=${page}&limit=30`);
    const data = await res.json();
    setLeads(data.leads || []);
    setTotal(data.total || 0);
    setPages(data.pages || 1);
    setLoading(false);
  }, [minScore, page]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const sentCount = leads.filter((l) => l.emailSent).length;
  const draftCount = leads.filter((l) => l.message?.status === "draft" && !l.emailSent).length;
  const noContactCount = leads.filter((l) => !l.email && !l.phone).length;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Flame className="w-7 h-7 sm:w-8 sm:h-8 text-orange-400" />
            Hot Leads
          </h1>
          <p className="text-[var(--muted-foreground)] mt-1 text-sm">
            {total} lead con score ≥ {minScore}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-[var(--muted-foreground)]">Score minimo:</label>
          <select
            value={minScore}
            onChange={(e) => { setMinScore(Number(e.target.value)); setPage(1); }}
            className="px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm text-[var(--foreground)]"
          >
            <option value={65}>≥ 65</option>
            <option value={70}>≥ 70</option>
            <option value={75}>≥ 75</option>
            <option value={80}>≥ 80</option>
            <option value={85}>≥ 85</option>
            <option value={90}>≥ 90</option>
          </select>
          <button
            onClick={fetchLeads}
            className="p-2 rounded-lg bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--muted)] text-[var(--foreground)]"
            title="Aggiorna"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Totale hot leads", value: total, color: "text-orange-400" },
          { label: "Email inviate", value: sentCount, color: "text-green-400" },
          { label: "Bozze pronte", value: draftCount, color: "text-yellow-400" },
          { label: "Senza contatto", value: noContactCount, color: "text-[var(--muted-foreground)]" },
        ].map((card) => (
          <div key={card.label} className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
            <p className="text-xs text-[var(--muted-foreground)] mb-1">{card.label}</p>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Table / Mobile Cards */}
      {loading ? (
        <div className="text-center py-20 text-[var(--muted-foreground)]">Caricamento...</div>
      ) : leads.length === 0 ? (
        <div className="text-center py-20 bg-[var(--card)] rounded-xl border border-[var(--border)] text-[var(--muted-foreground)]">
          <Flame className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nessun lead con score ≥ {minScore}</p>
          <p className="text-sm mt-1">Lancia un job di analisi dalla pagina Jobs</p>
        </div>
      ) : (
        <>
          {/* Mobile view */}
          <div className="md:hidden space-y-4">
            {leads.map((lead) => (
              <div key={lead.id} className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4 flex flex-col gap-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--foreground)] truncate">{lead.companyName}</div>
                    <div className="text-xs text-[var(--muted-foreground)] mt-0.5 truncate">{[lead.sector, lead.city].filter(Boolean).join(" • ")}</div>
                  </div>
                  <ScoreBadge score={lead.score} />
                </div>
                
                <div className="flex flex-col gap-1.5 text-sm bg-[var(--muted)]/30 rounded-lg p-3">
                  {lead.email && <div className="truncate text-xs">✉️ <a href={`mailto:${lead.email}`} className="text-[var(--primary)] truncate">{lead.email}</a></div>}
                  {lead.phone && <div className="truncate text-xs">📞 <a href={`tel:${lead.phone}`} className="text-[var(--primary)]">{lead.phone}</a></div>}
                </div>

                <div className="flex items-center justify-between border-t border-[var(--border)] pt-3 mt-1">
                  <MessageStatus lead={lead} />
                  <Link href={`/leads/${lead.id}`} className="text-xs font-medium text-[var(--primary)] py-1.5 px-3 bg-[var(--primary)]/10 rounded-md hover:bg-[var(--primary)]/20 transition-colors">
                    Apri Scheda
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop view */}
          <div className="hidden md:block bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)] bg-[var(--muted)]/20">
                    <th className="text-left px-5 py-4 font-medium whitespace-nowrap">Azienda</th>
                    <th className="text-left px-5 py-4 font-medium hidden sm:table-cell whitespace-nowrap">Settore / Città</th>
                    <th className="text-center px-5 py-4 font-medium whitespace-nowrap">Score</th>
                    <th className="text-left px-5 py-4 font-medium hidden lg:table-cell whitespace-nowrap">Servizio</th>
                    <th className="text-left px-5 py-4 font-medium whitespace-nowrap">Contatto</th>
                    <th className="text-left px-5 py-4 font-medium whitespace-nowrap">Stato email</th>
                    <th className="text-center px-5 py-4 font-medium">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead, i) => (
                    <tr
                      key={lead.id}
                      className={`border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/50 transition-colors ${
                        i === 0 && lead.score >= 85 ? "bg-orange-500/5" : ""
                      }`}
                    >
                      <td className="px-5 py-4 max-w-[200px]">
                        <div className="font-medium text-[var(--foreground)] truncate">{lead.companyName}</div>
                      </td>
                      <td className="px-5 py-4 hidden sm:table-cell text-[var(--muted-foreground)] truncate max-w-[180px]">
                        {[lead.sector, lead.city].filter(Boolean).join(" • ")}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <ScoreBadge score={lead.score} />
                      </td>
                      <td className="px-5 py-4 hidden lg:table-cell text-[var(--muted-foreground)] text-xs truncate max-w-[150px]">
                        {lead.suggestedService || "Da analizzare"}
                      </td>
                      <td className="px-5 py-4 min-w-[180px]">
                        <div className="space-y-1 text-[13px]">
                          {lead.email && <a href={`mailto:${lead.email}`} className="text-[var(--primary)] hover:underline truncate block max-w-[200px]">✉️ {lead.email}</a>}
                          {lead.phone && <a href={`tel:${lead.phone}`} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] block">📞 {lead.phone}</a>}
                        </div>
                      </td>
                      <td className="px-5 py-4 min-w-[150px]">
                        <MessageStatus lead={lead} />
                      </td>
                      <td className="px-5 py-4 text-center">
                        <Link
                          href={`/leads/${lead.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--muted)] hover:bg-[var(--primary)] text-[var(--foreground)] hover:text-[var(--primary-foreground)] rounded-md transition-colors text-xs font-medium whitespace-nowrap"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Apri
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded-lg bg-[var(--card)] border border-[var(--border)] disabled:opacity-40 hover:bg-[var(--muted)] text-[var(--foreground)]"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-[var(--muted-foreground)]">
            Pagina {page} di {pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page === pages}
            className="p-2 rounded-lg bg-[var(--card)] border border-[var(--border)] disabled:opacity-40 hover:bg-[var(--muted)] text-[var(--foreground)]"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
