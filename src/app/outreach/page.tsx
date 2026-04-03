"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Phone,
  MessageCircle,
  CheckCircle2,
  Copy,
  Check,
  Filter,
  ExternalLink,
  Mail,
  RefreshCw,
} from "lucide-react";

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
  messages: {
    id: number;
    type: string;
    subject: string | null;
    content: string;
    whatsappContent: string | null;
    status: string;
  }[];
  analyses: { aiScore: number | null; suggestedService: string | null }[];
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70 ? "bg-green-900/40 text-green-300 border-green-600/40" :
    score >= 40 ? "bg-yellow-900/40 text-yellow-300 border-yellow-600/40" :
    "bg-red-900/40 text-red-300 border-red-600/40";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${color}`}>
      {score}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--muted-foreground)] transition-colors"
      title="Copia testo"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copiato" : "Copia"}
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

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  async function markContacted(leadId: number) {
    setMarking(leadId);
    await fetch("/api/outreach", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId }),
    });
    setLeads((prev) => prev.filter((l) => l.id !== leadId));
    setTotal((t) => t - 1);
    setMarking(null);
  }

  const totalPages = Math.ceil(total / 25);
  const phoneOnlyCount = leads.filter((lead) => lead.phone && !lead.email).length;
  const reviewCount = leads.filter((lead) => Boolean(lead.email && lead.messages[0]?.status === "draft")).length;

  function getWhatsAppLink(phone: string, text: string) {
    const clean = phone.replace(/\D/g, "");
    const italianPhone = clean.startsWith("39") ? clean : `39${clean}`;
    return `https://wa.me/${italianPhone}?text=${encodeURIComponent(text)}`;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <MessageCircle className="w-7 h-7 sm:w-8 sm:h-8 text-[var(--primary)]" />
            Outreach Manuale
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Lead da contattare manualmente: solo telefono oppure revisione manuale decisa dall&apos;AI
          </p>
        </div>
        <button
          onClick={fetchLeads}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--muted)] hover:bg-[var(--border)] text-sm"
        >
          <RefreshCw className="w-4 h-4" /> Aggiorna
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 mb-5">
        <div className="surface-card p-4">
          <p className="text-xs text-[var(--muted-foreground)]">Lead in coda</p>
          <p className="mt-2 text-2xl font-bold">{total}</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs text-[var(--muted-foreground)]">Solo telefono</p>
          <p className="mt-2 text-2xl font-bold">{phoneOnlyCount}</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs text-[var(--muted-foreground)]">Revisione testi</p>
          <p className="mt-2 text-2xl font-bold">{reviewCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="toolbar-wrap mb-5">
        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-sm">
          <Filter className="w-4 h-4 text-[var(--muted-foreground)]" />
          <input
            type="text"
            placeholder="Settore..."
            value={sectorFilter}
            onChange={(e) => { setSectorFilter(e.target.value); setPage(1); }}
            className="bg-transparent outline-none w-28 text-sm"
          />
        </div>
        <select
          value={priorityFilter}
          onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg text-sm text-[var(--foreground)]"
        >
          <option value="">Tutte le priorità</option>
          <option value="alta">Alta (score ≥ 70)</option>
          <option value="media">Media (40–69)</option>
          <option value="bassa">Bassa (&lt; 40)</option>
        </select>
        <span className="flex items-center text-sm text-[var(--muted-foreground)] ml-auto">
          {loading ? "Caricamento..." : `${total} lead`}
        </span>
      </div>

      {/* Lead cards */}
      {loading ? (
        <div className="text-center py-16 text-[var(--muted-foreground)]">Caricamento...</div>
      ) : leads.length === 0 ? (
        <div className="text-center py-16 text-[var(--muted-foreground)]">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-500/50" />
          <p className="font-medium">Nessun lead da contattare manualmente.</p>
          <p className="text-sm mt-1">Zona libera! Tutti i lead approvati dall&apos;AI sono gia&apos; andati in invio automatico.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {leads.map((lead) => {
            const message = lead.messages[0];
            const waText = message?.whatsappContent || message?.content || "";
            const isExpanded = expandedId === lead.id;

            return (
              <div
                key={lead.id}
                className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 sm:p-5"
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-base truncate">{lead.companyName}</h3>
                      <ScoreBadge score={lead.score} />
                      {lead.phone && !lead.email && (
                        <span className="text-xs px-2 py-0.5 rounded bg-green-900/30 text-green-300 border border-green-600/30">
                          Solo telefono
                        </span>
                      )}
                      {lead.email && message?.status === "draft" && (
                        <span className="text-xs px-2 py-0.5 rounded bg-orange-900/30 text-orange-300 border border-orange-600/30">
                          Revisione AI/manuale
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-[var(--muted-foreground)]">
                      {lead.sector && <span>{lead.sector}</span>}
                      {(lead.city || lead.region) && (
                        <span>{[lead.city, lead.region].filter(Boolean).join(", ")}</span>
                      )}
                      {lead.phone && (
                        <a href={`tel:${lead.phone}`} className="flex items-center gap-1 hover:text-[var(--foreground)]">
                          <Phone className="w-3 h-3" /> {lead.phone}
                        </a>
                      )}
                      {lead.email && (
                        <a href={`mailto:${lead.email}`} className="flex items-center gap-1 hover:text-[var(--foreground)]">
                          <Mail className="w-3 h-3" /> {lead.email}
                        </a>
                      )}
                      {lead.website && (
                        <a
                          href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 hover:text-[var(--foreground)]"
                        >
                          <ExternalLink className="w-3 h-3" /> {lead.website}
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="toolbar-wrap flex-shrink-0 sm:justify-end">
                    {lead.phone && waText && (
                      <a
                        href={getWhatsAppLink(lead.phone, waText)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-700 hover:bg-green-600 text-white text-xs font-medium"
                      >
                        <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                      </a>
                    )}
                    <button
                      onClick={() => markContacted(lead.id)}
                      disabled={marking === lead.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--muted)] hover:bg-[var(--border)] text-xs font-medium disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                      {marking === lead.id ? "..." : "Contattato"}
                    </button>
                  </div>
                </div>

                {/* Expand toggle */}
                {message && (
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : lead.id)}
                    className="mt-3 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] underline-offset-2 hover:underline"
                  >
                    {isExpanded ? "Nascondi testi" : "Mostra testi generati →"}
                  </button>
                )}

                {/* Expanded: texts */}
                {isExpanded && message && (
                  <div className="mt-4 space-y-4">
                    {/* WhatsApp text */}
                    {waText && (
                      <div className="rounded-lg border border-green-600/30 bg-green-900/10 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-green-300 uppercase tracking-wide flex items-center gap-1">
                            <MessageCircle className="w-3.5 h-3.5" /> Messaggio WhatsApp
                          </span>
                          <CopyButton text={message.whatsappContent || waText} />
                        </div>
                        <p className="text-sm text-[var(--foreground)] whitespace-pre-wrap leading-relaxed">
                          {message.whatsappContent || waText}
                        </p>
                      </div>
                    )}

                    {/* Email text */}
                    {message.content && (
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)] p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <span className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide flex items-center gap-1">
                              <Mail className="w-3.5 h-3.5" /> Email
                            </span>
                            {message.subject && (
                              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                                Oggetto: <span className="text-[var(--foreground)]">{message.subject}</span>
                              </p>
                            )}
                          </div>
                          <CopyButton text={`Oggetto: ${message.subject || ""}\n\n${message.content}`} />
                        </div>
                        <p className="text-sm text-[var(--foreground)] whitespace-pre-wrap leading-relaxed">
                          {message.content}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-8">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-lg text-sm bg-[var(--card)] border border-[var(--border)] disabled:opacity-40"
          >
            ← Precedente
          </button>
          <span className="text-sm text-[var(--muted-foreground)]">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 rounded-lg text-sm bg-[var(--card)] border border-[var(--border)] disabled:opacity-40"
          >
            Successiva →
          </button>
        </div>
      )}
    </div>
  );
}
