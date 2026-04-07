"use client";

import { useState, useEffect, useCallback } from "react";
import { Phone, MessageCircle, CheckCircle2, Copy, Check, Filter, ExternalLink, Mail, RefreshCw } from "lucide-react";

interface OutreachLead {
  id: number;
  companyName: string;
  contactName: string | null;
  sector: string | null;
  city: string | null;
  region: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  score: number;
  status: string;
  messages: { id: number; type: string; subject: string | null; content: string; whatsappContent: string | null; status: string }[];
  analyses: { aiScore: number | null; suggestedService: string | null }[];
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="btn btn-ghost btn-sm p-1.5">
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export default function OutreachPage() {
  const [leads, setLeads] = useState<OutreachLead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [sectorFilter, setSectorFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [marking, setMarking] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (sectorFilter) params.set("sector", sectorFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    const res = await fetch(`/api/outreach?${params}`);
    const data = await res.json();
    setLeads(data.leads || []);
    setTotal(data.total || 0);
    setLoading(false);
  }, [page, sectorFilter, priorityFilter]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  async function markContacted(leadId: number) {
    setMarking(leadId);
    await fetch("/api/outreach", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId }) });
    setLeads((prev) => prev.filter((l) => l.id !== leadId));
    setTotal((t) => t - 1);
    setMarking(null);
  }

  function getWhatsAppLink(phone: string, text: string) {
    const clean = phone.replace(/\D/g, "");
    const num = clean.startsWith("39") ? clean : `39${clean}`;
    return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
  }

  const totalPages = Math.ceil(total / 25);
  const phoneOnlyCount = leads.filter((l) => l.phone && !l.email).length;
  const reviewCount = leads.filter((l) => Boolean(l.email && l.messages[0]?.status === "draft")).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"><MessageCircle className="w-6 h-6 text-[var(--primary)]" /> Outreach Manuale</h1>
          <p className="page-subtitle">Lead da contattare: solo telefono o revisione AI</p>
        </div>
        <button onClick={fetchLeads} className="btn btn-outline"><RefreshCw className="w-4 h-4" /> Aggiorna</button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "In coda", value: total, color: "text-[var(--foreground)]" },
          { label: "Solo telefono", value: phoneOnlyCount, color: "text-sky-400" },
          { label: "Revisione testi", value: reviewCount, color: "text-amber-400" },
        ].map((c) => (
          <div key={c.label} className="kpi-card"><p className="kpi-label">{c.label}</p><p className={`kpi-value ${c.color}`}>{c.value}</p></div>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-5">
        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius)] text-sm">
          <Filter className="w-4 h-4 text-[var(--muted-foreground)]" />
          <input type="text" placeholder="Settore..." value={sectorFilter} onChange={(e) => { setSectorFilter(e.target.value); setPage(1); }} className="bg-transparent outline-none w-28 text-sm" />
        </div>
        <select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }} className="input w-auto min-w-[160px]">
          <option value="">Tutte le priorità</option>
          <option value="alta">Alta (≥ 70)</option>
          <option value="media">Media (40–69)</option>
          <option value="bassa">Bassa (&lt; 40)</option>
        </select>
      </div>

      {loading ? (
        <div className="empty-state"><p>Caricamento...</p></div>
      ) : leads.length === 0 ? (
        <div className="section-card empty-state">
          <CheckCircle2 className="w-12 h-12 text-emerald-500/50" />
          <p>Nessun lead da contattare</p>
          <p>Tutti i lead approvati sono in invio automatico.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => {
            const message = lead.messages[0];
            const waText = message?.whatsappContent || message?.content || "";
            const isExpanded = expandedId === lead.id;

            return (
              <div key={lead.id} className="section-card p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm">{lead.companyName}</h3>
                      <span className="badge badge-orange">{lead.score}</span>
                      {lead.phone && !lead.email && <span className="badge badge-green">Solo telefono</span>}
                      {lead.email && message?.status === "draft" && <span className="badge badge-yellow">Revisione</span>}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-[var(--muted-foreground)]">
                      {lead.sector && <span>{lead.sector}</span>}
                      {(lead.city || lead.region) && <span>{[lead.city, lead.region].filter(Boolean).join(", ")}</span>}
                      {lead.phone && <a href={`tel:${lead.phone}`} className="flex items-center gap-1 hover:text-[var(--foreground)]"><Phone className="w-3 h-3" /> {lead.phone}</a>}
                      {lead.email && <a href={`mailto:${lead.email}`} className="flex items-center gap-1 hover:text-[var(--foreground)]"><Mail className="w-3 h-3" /> {lead.email}</a>}
                      {lead.website && <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-[var(--foreground)]"><ExternalLink className="w-3 h-3" /> Sito</a>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {lead.phone && waText && (
                      <a href={getWhatsAppLink(lead.phone, waText)} target="_blank" rel="noopener noreferrer" className="btn btn-success btn-sm"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</a>
                    )}
                    <button onClick={() => markContacted(lead.id)} disabled={marking === lead.id} className="btn btn-outline btn-sm">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> {marking === lead.id ? "..." : "Fatto"}
                    </button>
                  </div>
                </div>
                {message && (
                  <button onClick={() => setExpandedId(isExpanded ? null : lead.id)} className="mt-2 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:underline">
                    {isExpanded ? "Nascondi testi" : "Mostra testi →"}
                  </button>
                )}
                {isExpanded && message && (
                  <div className="mt-3 space-y-3">
                    {waText && (
                      <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">WhatsApp</span>
                          <CopyBtn text={message.whatsappContent || waText} />
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{message.whatsappContent || waText}</p>
                      </div>
                    )}
                    {message.content && (
                      <div className="rounded-lg bg-[var(--muted)] p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Email</span>
                          <CopyBtn text={`Oggetto: ${message.subject || ""}\n\n${message.content}`} />
                        </div>
                        {message.subject && <p className="text-xs text-[var(--muted-foreground)] mb-1">Ogg: {message.subject}</p>}
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn btn-outline btn-sm">← Prec</button>
          <span className="text-sm text-[var(--muted-foreground)]">{page} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn btn-outline btn-sm">Succ →</button>
        </div>
      )}
    </div>
  );
}
