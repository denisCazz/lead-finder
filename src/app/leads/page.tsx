"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Users,
  Search,
  ExternalLink,
  Trash2,
  Sparkles,
  BarChart3,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface Lead {
  id: number;
  companyName: string;
  contactName: string | null;
  sector: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  score: number;
  status: string;
  source: string | null;
  createdAt: string;
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const perPage = 25;

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: page.toString(),
      limit: perPage.toString(),
    });
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);

    const res = await fetch(`/api/leads?${params}`);
    const data = await res.json();
    setLeads(data.leads || []);
    setTotal(data.total || 0);
    setLoading(false);
  }, [page, search, statusFilter]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  async function handleAnalyze(leadId: number) {
    await fetch(`/api/analyze/${leadId}`, { method: "POST" });
    fetchLeads();
  }

  async function handleGenerate(leadId: number) {
    await fetch(`/api/messages/generate/${leadId}`, { method: "POST" });
    fetchLeads();
  }

  async function handleDelete(leadId: number) {
    if (!confirm("Eliminare questo lead?")) return;
    await fetch(`/api/leads/${leadId}`, { method: "DELETE" });
    fetchLeads();
  }

  const totalPages = Math.ceil(total / perPage);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Users className="w-8 h-8 text-[var(--primary)]" />
            Leads
          </h1>
          <p className="text-[var(--muted-foreground)] mt-1">{total} lead totali</p>
        </div>
        <Link
          href="/campaigns"
          className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 text-sm font-medium"
        >
          + Nuova Campagna
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
          <input
            type="text"
            placeholder="Cerca azienda..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-4 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] text-sm"
        >
          <option value="">Tutti gli stati</option>
          <option value="new">Nuovo</option>
          <option value="analyzed">Analizzato</option>
          <option value="contacted">Contattato</option>
          <option value="replied">Risposto</option>
          <option value="rejected">Scartato</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-[var(--muted-foreground)]">Caricamento...</div>
        ) : leads.length === 0 ? (
          <div className="p-8 text-center text-[var(--muted-foreground)]">Nessun lead trovato</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--muted-foreground)] border-b border-[var(--border)] bg-[var(--muted)]/30">
                  <th className="px-4 py-3 font-medium">Azienda</th>
                  <th className="px-4 py-3 font-medium">Settore</th>
                  <th className="px-4 py-3 font-medium">Città</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3 font-medium">Stato</th>
                  <th className="px-4 py-3 font-medium">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/20">
                    <td className="px-4 py-3">
                      <Link href={`/leads/${lead.id}`} className="text-[var(--primary)] hover:underline font-medium">
                        {lead.companyName}
                      </Link>
                      {lead.website && (
                        <a
                          href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 inline-block"
                        >
                          <ExternalLink className="w-3 h-3 text-[var(--muted-foreground)]" />
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">{lead.sector || "\u2014"}</td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">{lead.city || "\u2014"}</td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)] text-xs">{lead.email || "\u2014"}</td>
                    <td className="px-4 py-3">
                      <span className={`font-medium ${
                        lead.score >= 70 ? "text-red-400" : lead.score >= 40 ? "text-yellow-400" : "text-green-400"
                      }`}>
                        {lead.score}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        lead.status === "new" ? "bg-blue-500/20 text-blue-400" :
                        lead.status === "analyzed" ? "bg-yellow-500/20 text-yellow-400" :
                        lead.status === "contacted" ? "bg-green-500/20 text-green-400" :
                        lead.status === "replied" ? "bg-emerald-500/20 text-emerald-400" :
                        "bg-gray-500/20 text-gray-400"
                      }`}>
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {lead.status === "new" && (
                          <button
                            onClick={() => handleAnalyze(lead.id)}
                            className="p-1.5 rounded hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                            title="Analizza"
                          >
                            <BarChart3 className="w-4 h-4" />
                          </button>
                        )}
                        {(lead.status === "analyzed" || lead.status === "new") && (
                          <button
                            onClick={() => handleGenerate(lead.id)}
                            className="p-1.5 rounded hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                            title="Genera messaggio"
                          >
                            <Sparkles className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(lead.id)}
                          className="p-1.5 rounded hover:bg-red-500/20 text-[var(--muted-foreground)] hover:text-red-400"
                          title="Elimina"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)]">
            <p className="text-sm text-[var(--muted-foreground)]">
              Pagina {page} di {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="p-1.5 rounded hover:bg-[var(--muted)] disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded hover:bg-[var(--muted)] disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
