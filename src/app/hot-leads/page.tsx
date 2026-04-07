"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Flame, Mail, Phone, CheckCircle2, Clock, AlertCircle, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

interface Message { id: number; type: string; status: string; subject: string | null; sentAt: string | null; }

interface HotLead {
  id: number;
  companyName: string;
  sector: string | null;
  city: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  score: number;
  status: string;
  aiScore: number | null;
  suggestedService: string | null;
  message: Message | null;
  emailSent: boolean;
  whatsappReady: boolean;
}

function StatusIcon({ lead }: { lead: HotLead }) {
  if (lead.emailSent) return <span className="flex items-center gap-1.5 text-xs text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /> Email inviata</span>;
  if (lead.message?.status === "draft") return <span className="flex items-center gap-1.5 text-xs text-yellow-400"><Clock className="w-3.5 h-3.5" /> Bozza</span>;
  if (!lead.email && !lead.phone) return <span className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]"><AlertCircle className="w-3.5 h-3.5" /> No contatto</span>;
  return <span className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]"><Clock className="w-3.5 h-3.5" /> In attesa</span>;
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

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"><Flame className="w-6 h-6 text-orange-400" /> Hot Leads</h1>
          <p className="page-subtitle">{total} lead con score ≥ {minScore}</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={minScore} onChange={(e) => { setMinScore(Number(e.target.value)); setPage(1); }} className="input w-auto">
            <option value={65}>≥ 65</option><option value={70}>≥ 70</option><option value={75}>≥ 75</option>
            <option value={80}>≥ 80</option><option value={85}>≥ 85</option><option value={90}>≥ 90</option>
          </select>
          <button onClick={fetchLeads} className="btn btn-outline btn-sm p-2"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Hot Leads", value: total, color: "text-orange-400" },
          { label: "Email inviate", value: sentCount, color: "text-emerald-400" },
          { label: "Bozze", value: draftCount, color: "text-yellow-400" },
          { label: "In pagina", value: leads.length, color: "text-[var(--foreground)]" },
        ].map((c) => (
          <div key={c.label} className="kpi-card"><p className="kpi-label">{c.label}</p><p className={`kpi-value ${c.color}`}>{c.value}</p></div>
        ))}
      </div>

      {loading ? (
        <div className="empty-state"><p>Caricamento...</p></div>
      ) : leads.length === 0 ? (
        <div className="section-card empty-state"><Flame className="w-12 h-12" /><p>Nessun lead con score ≥ {minScore}</p><p>Lancia un job di analisi dalla pagina Jobs</p></div>
      ) : (
        <>
          {/* Mobile */}
          <div className="md:hidden space-y-3">
            {leads.map((lead) => (
              <div key={lead.id} className="section-card p-4">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <Link href={`/leads/${lead.id}`} className="font-semibold text-[var(--foreground)] hover:text-[var(--primary)]">{lead.companyName}</Link>
                    <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{[lead.sector, lead.city].filter(Boolean).join(" · ")}</p>
                  </div>
                  <span className="badge badge-orange font-bold">{lead.score}</span>
                </div>
                <div className="flex flex-col gap-1 text-xs mt-2">
                  {lead.email && <span className="text-emerald-400 flex items-center gap-1"><Mail className="w-3 h-3" /> {lead.email}</span>}
                  {lead.phone && <span className="text-sky-400 flex items-center gap-1"><Phone className="w-3 h-3" /> {lead.phone}</span>}
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
                  <StatusIcon lead={lead} />
                  <Link href={`/leads/${lead.id}`} className="btn btn-outline btn-sm">Apri Scheda</Link>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop */}
          <div className="hidden md:block table-wrap">
            <table>
              <thead><tr><th>Lead</th><th>Score</th><th>AI</th><th>Servizio</th><th>Contatti</th><th>Stato</th><th></th></tr></thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <Link href={`/leads/${lead.id}`} className="font-medium text-[var(--foreground)] hover:text-[var(--primary)]">{lead.companyName}</Link>
                      <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{[lead.sector, lead.city].filter(Boolean).join(" · ")}</p>
                    </td>
                    <td><span className="badge badge-orange font-bold">{lead.score}</span></td>
                    <td className="text-[var(--muted-foreground)]">{lead.aiScore ?? "—"}</td>
                    <td className="text-[var(--muted-foreground)] text-sm">{lead.suggestedService || "—"}</td>
                    <td>
                      <div className="flex flex-col gap-0.5 text-xs">
                        {lead.email && <span className="text-emerald-400"><Mail className="w-3 h-3 inline mr-1" />{lead.email}</span>}
                        {lead.phone && <span className="text-sky-400"><Phone className="w-3 h-3 inline mr-1" />{lead.phone}</span>}
                        {!lead.email && !lead.phone && <span className="text-[var(--muted-foreground)]">—</span>}
                      </div>
                    </td>
                    <td><StatusIcon lead={lead} /></td>
                    <td><Link href={`/leads/${lead.id}`} className="btn btn-ghost btn-sm">Apri</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn btn-outline btn-sm"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-sm text-[var(--muted-foreground)]">{page} / {pages}</span>
              <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages} className="btn btn-outline btn-sm"><ChevronRight className="w-4 h-4" /></button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
