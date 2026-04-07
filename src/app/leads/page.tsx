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
  SlidersHorizontal,
  ArrowUpDown,
  Mail,
  Phone,
  X,
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
  const [sectorFilter, setSectorFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [scoreMin, setScoreMin] = useState("");
  const [scoreMax, setScoreMax] = useState("");
  const [hasEmail, setHasEmail] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [sectors, setSectors] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const perPage = 25;

  const activeFilterCount = [statusFilter, sectorFilter, cityFilter, scoreMin, scoreMax, hasEmail].filter(Boolean).length;

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: page.toString(),
      limit: perPage.toString(),
      sortBy,
      sortDir,
    });
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    if (sectorFilter) params.set("sector", sectorFilter);
    if (cityFilter) params.set("city", cityFilter);
    if (scoreMin) params.set("scoreMin", scoreMin);
    if (scoreMax) params.set("scoreMax", scoreMax);
    if (hasEmail) params.set("hasEmail", hasEmail);

    const res = await fetch(`/api/leads?${params}`);
    const data = await res.json();
    setLeads(data.leads || []);
    setTotal(data.total || 0);
    if (data.sectors) setSectors(data.sectors);
    if (data.cities) setCities(data.cities);
    setLoading(false);
  }, [page, search, statusFilter, sectorFilter, cityFilter, scoreMin, scoreMax, hasEmail, sortBy, sortDir]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Debounced search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

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

  function clearFilters() {
    setStatusFilter("");
    setSectorFilter("");
    setCityFilter("");
    setScoreMin("");
    setScoreMax("");
    setHasEmail("");
    setPage(1);
  }

  function toggleSort(field: string) {
    if (sortBy === field) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
    setPage(1);
  }

  const totalPages = Math.ceil(total / perPage);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Users className="w-7 h-7 sm:w-8 sm:h-8 text-[var(--primary)]" />
            Leads
          </h1>
          <p className="text-[var(--muted-foreground)] mt-1 text-sm">{total} lead trovati</p>
        </div>
        <Link
          href="/jobs"
          className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 text-sm font-medium text-center"
        >
          Lancia job
        </Link>
      </div>

      {/* Search + filter toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
          <input
            type="text"
            placeholder="Cerca azienda, settore, città, email, telefono..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition shrink-0 ${
            showFilters || activeFilterCount > 0
              ? "border-[var(--primary)]/50 bg-[var(--primary)]/10 text-[var(--primary)]"
              : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]"
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filtri{activeFilterCount > 0 && ` (${activeFilterCount})`}
        </button>
      </div>

      {/* Advanced filters panel */}
      {showFilters && (
        <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium">Filtri avanzati</p>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="inline-flex items-center gap-1 text-xs text-[var(--primary)] hover:underline">
                <X className="w-3 h-3" />
                Resetta filtri
              </button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div>
              <label className="text-xs text-[var(--muted-foreground)] mb-1 block">Stato</label>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] text-sm"
              >
                <option value="">Tutti</option>
                <option value="new">Nuovo</option>
                <option value="analyzed">Analizzato</option>
                <option value="contacted">Contattato</option>
                <option value="replied">Risposto</option>
                <option value="rejected">Scartato</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--muted-foreground)] mb-1 block">Settore</label>
              <select
                value={sectorFilter}
                onChange={(e) => { setSectorFilter(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] text-sm"
              >
                <option value="">Tutti i settori</option>
                {sectors.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--muted-foreground)] mb-1 block">Città</label>
              <select
                value={cityFilter}
                onChange={(e) => { setCityFilter(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] text-sm"
              >
                <option value="">Tutte le città</option>
                {cities.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--muted-foreground)] mb-1 block">Score min</label>
              <input
                type="number"
                value={scoreMin}
                onChange={(e) => { setScoreMin(e.target.value); setPage(1); }}
                placeholder="0"
                min="0"
                max="100"
                className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted-foreground)] mb-1 block">Score max</label>
              <input
                type="number"
                value={scoreMax}
                onChange={(e) => { setScoreMax(e.target.value); setPage(1); }}
                placeholder="100"
                min="0"
                max="100"
                className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted-foreground)] mb-1 block">Contatto email</label>
              <select
                value={hasEmail}
                onChange={(e) => { setHasEmail(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] text-sm"
              >
                <option value="">Tutti</option>
                <option value="yes">Con email</option>
                <option value="no">Senza email</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Quick filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => { setScoreMin("70"); setScoreMax(""); setStatusFilter(""); setHasEmail(""); setPage(1); setShowFilters(true); }}
          className={`text-xs px-3 py-1.5 rounded-full border transition ${
            scoreMin === "70" && !scoreMax && !statusFilter ? "border-orange-500/50 bg-orange-500/10 text-orange-300" : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          }`}
        >
          Hot leads (score 70+)
        </button>
        <button
          onClick={() => { setHasEmail("yes"); setStatusFilter("analyzed"); setScoreMin(""); setScoreMax(""); setPage(1); setShowFilters(true); }}
          className={`text-xs px-3 py-1.5 rounded-full border transition ${
            hasEmail === "yes" && statusFilter === "analyzed" ? "border-green-500/50 bg-green-500/10 text-green-300" : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          }`}
        >
          Pronti da contattare
        </button>
        <button
          onClick={() => { setStatusFilter("new"); setScoreMin(""); setScoreMax(""); setHasEmail(""); setPage(1); setShowFilters(true); }}
          className={`text-xs px-3 py-1.5 rounded-full border transition ${
            statusFilter === "new" && !scoreMin && !hasEmail ? "border-blue-500/50 bg-blue-500/10 text-blue-300" : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          }`}
        >
          Da analizzare
        </button>
        <button
          onClick={() => { setHasEmail("no"); setStatusFilter(""); setScoreMin(""); setScoreMax(""); setPage(1); setShowFilters(true); }}
          className={`text-xs px-3 py-1.5 rounded-full border transition ${
            hasEmail === "no" && !statusFilter ? "border-amber-500/50 bg-amber-500/10 text-amber-300" : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          }`}
        >
          Senza email
        </button>
        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="text-xs px-3 py-1.5 rounded-full border border-red-500/30 text-red-300 hover:bg-red-500/10 transition"
          >
            Resetta tutto
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-[var(--muted-foreground)]">Caricamento...</div>
        ) : leads.length === 0 ? (
          <div className="p-8 text-center text-[var(--muted-foreground)]">
            <p className="text-lg font-medium mb-1">Nessun lead trovato</p>
            <p className="text-sm">Prova a modificare i filtri o ad avviare un nuovo job di ricerca.</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="mobile-card-list p-3 md:hidden">
              {leads.map((lead) => (
                <div key={lead.id} className="surface-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/leads/${lead.id}`} className="font-semibold text-[var(--primary)] hover:underline">
                          {lead.companyName}
                        </Link>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          lead.status === "new" ? "bg-blue-500/20 text-blue-400" :
                          lead.status === "analyzed" ? "bg-yellow-500/20 text-yellow-400" :
                          lead.status === "contacted" ? "bg-green-500/20 text-green-400" :
                          lead.status === "replied" ? "bg-emerald-500/20 text-emerald-400" :
                          "bg-gray-500/20 text-gray-400"
                        }`}>
                          {lead.status}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-[var(--muted-foreground)]">
                        <p>{lead.sector || "Settore non definito"}</p>
                        <p>{lead.city || "Città non definita"}</p>
                        <div className="flex flex-col gap-1 mt-1">
                          {lead.email && (
                            <span className="inline-flex items-center gap-1 text-green-400">
                              <Mail className="w-3 h-3" /> {lead.email}
                            </span>
                          )}
                          {lead.phone && (
                            <span className="inline-flex items-center gap-1 text-sky-400">
                              <Phone className="w-3 h-3" /> {lead.phone}
                            </span>
                          )}
                          {!lead.email && !lead.phone && <span>Nessun contatto</span>}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${
                        lead.score >= 70 ? "text-orange-400" : lead.score >= 40 ? "text-yellow-400" : "text-slate-400"
                      }`}>
                        {lead.score}
                      </p>
                      {lead.website && (
                        <a
                          href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                        >
                          <ExternalLink className="w-3 h-3" /> sito
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="toolbar-wrap mt-4">
                    {lead.status === "new" && (
                      <button
                        onClick={() => handleAnalyze(lead.id)}
                        className="inline-flex items-center gap-2 rounded-lg bg-[var(--muted)] px-3 py-2 text-xs"
                      >
                        <BarChart3 className="w-4 h-4" /> Analizza
                      </button>
                    )}
                    {(lead.status === "analyzed" || lead.status === "new") && (
                      <button
                        onClick={() => handleGenerate(lead.id)}
                        className="inline-flex items-center gap-2 rounded-lg bg-[var(--muted)] px-3 py-2 text-xs"
                      >
                        <Sparkles className="w-4 h-4" /> Genera testo
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(lead.id)}
                      className="inline-flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300"
                    >
                      <Trash2 className="w-4 h-4" /> Elimina
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--muted-foreground)] border-b border-[var(--border)] bg-[var(--muted)]/30">
                    <th className="px-4 py-3 font-medium">
                      <button onClick={() => toggleSort("companyName")} className="inline-flex items-center gap-1 hover:text-[var(--foreground)]">
                        Azienda <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="px-4 py-3 font-medium">Settore</th>
                    <th className="px-4 py-3 font-medium">Città</th>
                    <th className="px-4 py-3 font-medium">Contatti</th>
                    <th className="px-4 py-3 font-medium">
                      <button onClick={() => toggleSort("score")} className="inline-flex items-center gap-1 hover:text-[var(--foreground)]">
                        Score <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
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
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {lead.email && (
                            <span className="inline-flex items-center gap-1 text-xs text-green-400">
                              <Mail className="w-3 h-3" /> {lead.email}
                            </span>
                          )}
                          {lead.phone && (
                            <span className="inline-flex items-center gap-1 text-xs text-sky-400">
                              <Phone className="w-3 h-3" /> {lead.phone}
                            </span>
                          )}
                          {!lead.email && !lead.phone && (
                            <span className="text-xs text-[var(--muted-foreground)]">{"\u2014"}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-semibold ${
                          lead.score >= 70 ? "text-orange-400" : lead.score >= 40 ? "text-yellow-400" : "text-slate-400"
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
          </>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)]">
            <p className="text-sm text-[var(--muted-foreground)]">
              Pagina {page} di {totalPages} ({total} risultati)
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="px-2.5 py-1.5 rounded text-xs hover:bg-[var(--muted)] disabled:opacity-30"
              >
                Prima
              </button>
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="p-1.5 rounded hover:bg-[var(--muted)] disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium px-2">{page}</span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded hover:bg-[var(--muted)] disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                className="px-2.5 py-1.5 rounded text-xs hover:bg-[var(--muted)] disabled:opacity-30"
              >
                Ultima
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
