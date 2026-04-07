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

const STATUS_BADGE: Record<string, string> = {
  new: "badge-blue",
  analyzed: "badge-yellow",
  contacted: "badge-green",
  replied: "badge-emerald",
  rejected: "badge-gray",
  negotiating: "badge-purple",
  won: "badge-green",
  lost: "badge-red",
};

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
    const params = new URLSearchParams({ page: page.toString(), limit: perPage.toString(), sortBy, sortDir });
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

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  async function handleAnalyze(leadId: number) { await fetch(`/api/analyze/${leadId}`, { method: "POST" }); fetchLeads(); }
  async function handleGenerate(leadId: number) { await fetch(`/api/messages/generate/${leadId}`, { method: "POST" }); fetchLeads(); }
  async function handleDelete(leadId: number) { if (!confirm("Eliminare questo lead?")) return; await fetch(`/api/leads/${leadId}`, { method: "DELETE" }); fetchLeads(); }

  function clearFilters() { setStatusFilter(""); setSectorFilter(""); setCityFilter(""); setScoreMin(""); setScoreMax(""); setHasEmail(""); setPage(1); }

  function toggleSort(field: string) {
    if (sortBy === field) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else { setSortBy(field); setSortDir("desc"); }
    setPage(1);
  }

  const totalPages = Math.ceil(total / perPage);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"><Users className="w-6 h-6 text-[var(--primary)]" /> Leads</h1>
          <p className="page-subtitle">{total} lead trovati</p>
        </div>
        <Link href="/jobs" className="btn btn-primary">Lancia job</Link>
      </div>

      {/* Search + filter toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
          <input
            type="text"
            placeholder="Cerca azienda, settore, città, email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="input pl-10"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`btn ${showFilters || activeFilterCount > 0 ? "btn-primary" : "btn-outline"}`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filtri{activeFilterCount > 0 && ` (${activeFilterCount})`}
        </button>
      </div>

      {/* Advanced filters */}
      {showFilters && (
        <div className="section-card p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium">Filtri avanzati</p>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="btn btn-ghost btn-sm"><X className="w-3 h-3" /> Resetta</button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div>
              <label className="input-label">Stato</label>
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="input">
                <option value="">Tutti</option>
                <option value="new">Nuovo</option>
                <option value="analyzed">Analizzato</option>
                <option value="contacted">Contattato</option>
                <option value="replied">Risposto</option>
                <option value="rejected">Scartato</option>
              </select>
            </div>
            <div>
              <label className="input-label">Settore</label>
              <select value={sectorFilter} onChange={(e) => { setSectorFilter(e.target.value); setPage(1); }} className="input">
                <option value="">Tutti</option>
                {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Città</label>
              <select value={cityFilter} onChange={(e) => { setCityFilter(e.target.value); setPage(1); }} className="input">
                <option value="">Tutte</option>
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Score min</label>
              <input type="number" value={scoreMin} onChange={(e) => { setScoreMin(e.target.value); setPage(1); }} placeholder="0" min="0" max="100" className="input" />
            </div>
            <div>
              <label className="input-label">Score max</label>
              <input type="number" value={scoreMax} onChange={(e) => { setScoreMax(e.target.value); setPage(1); }} placeholder="100" min="0" max="100" className="input" />
            </div>
            <div>
              <label className="input-label">Email</label>
              <select value={hasEmail} onChange={(e) => { setHasEmail(e.target.value); setPage(1); }} className="input">
                <option value="">Tutti</option>
                <option value="yes">Con email</option>
                <option value="no">Senza email</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Quick filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { label: "Hot leads (70+)", fn: () => { setScoreMin("70"); setScoreMax(""); setStatusFilter(""); setHasEmail(""); setPage(1); setShowFilters(true); }, active: scoreMin === "70" && !scoreMax && !statusFilter },
          { label: "Pronti da contattare", fn: () => { setHasEmail("yes"); setStatusFilter("analyzed"); setScoreMin(""); setScoreMax(""); setPage(1); setShowFilters(true); }, active: hasEmail === "yes" && statusFilter === "analyzed" },
          { label: "Da analizzare", fn: () => { setStatusFilter("new"); setScoreMin(""); setScoreMax(""); setHasEmail(""); setPage(1); setShowFilters(true); }, active: statusFilter === "new" && !scoreMin && !hasEmail },
          { label: "Senza email", fn: () => { setHasEmail("no"); setStatusFilter(""); setScoreMin(""); setScoreMax(""); setPage(1); setShowFilters(true); }, active: hasEmail === "no" && !statusFilter },
        ].map((chip) => (
          <button key={chip.label} onClick={chip.fn}
            className={`badge cursor-pointer ${chip.active ? "badge-blue" : "badge-gray hover:bg-[var(--muted)]"}`}
          >{chip.label}</button>
        ))}
        {activeFilterCount > 0 && <button onClick={clearFilters} className="badge badge-red cursor-pointer">Resetta tutto</button>}
      </div>

      {/* Table */}
      {loading ? (
        <div className="empty-state"><p>Caricamento...</p></div>
      ) : leads.length === 0 ? (
        <div className="section-card empty-state">
          <Users className="w-12 h-12" />
          <p>Nessun lead trovato</p>
          <p>Modifica i filtri o lancia un job di ricerca.</p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {leads.map((lead) => (
              <div key={lead.id} className="section-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/leads/${lead.id}`} className="font-semibold text-[var(--primary)] hover:underline">{lead.companyName}</Link>
                      <span className={`badge ${STATUS_BADGE[lead.status] || "badge-gray"}`}>{lead.status}</span>
                    </div>
                    <div className="mt-1.5 text-xs text-[var(--muted-foreground)] space-y-1">
                      <p>{lead.sector || "—"} · {lead.city || "—"}</p>
                      {lead.email && <p className="flex items-center gap-1 text-emerald-400"><Mail className="w-3 h-3" /> {lead.email}</p>}
                      {lead.phone && <p className="flex items-center gap-1 text-sky-400"><Phone className="w-3 h-3" /> {lead.phone}</p>}
                    </div>
                  </div>
                  <span className={`text-lg font-bold ${lead.score >= 70 ? "text-orange-400" : lead.score >= 40 ? "text-yellow-400" : "text-slate-400"}`}>{lead.score}</span>
                </div>
                <div className="flex gap-2 mt-3">
                  {lead.status === "new" && <button onClick={() => handleAnalyze(lead.id)} className="btn btn-outline btn-sm"><BarChart3 className="w-3.5 h-3.5" /> Analizza</button>}
                  {(lead.status === "analyzed" || lead.status === "new") && <button onClick={() => handleGenerate(lead.id)} className="btn btn-outline btn-sm"><Sparkles className="w-3.5 h-3.5" /> Genera</button>}
                  <button onClick={() => handleDelete(lead.id)} className="btn btn-danger btn-sm"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block table-wrap">
            <table>
              <thead>
                <tr>
                  <th><button onClick={() => toggleSort("companyName")} className="inline-flex items-center gap-1 hover:text-[var(--foreground)]">Azienda <ArrowUpDown className="w-3 h-3" /></button></th>
                  <th>Settore</th>
                  <th>Città</th>
                  <th>Contatti</th>
                  <th><button onClick={() => toggleSort("score")} className="inline-flex items-center gap-1 hover:text-[var(--foreground)]">Score <ArrowUpDown className="w-3 h-3" /></button></th>
                  <th>Stato</th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <Link href={`/leads/${lead.id}`} className="text-[var(--primary)] hover:underline font-medium">{lead.companyName}</Link>
                      {lead.website && (
                        <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" className="ml-1.5 inline-block">
                          <ExternalLink className="w-3 h-3 text-[var(--muted-foreground)]" />
                        </a>
                      )}
                    </td>
                    <td className="text-[var(--muted-foreground)]">{lead.sector || "—"}</td>
                    <td className="text-[var(--muted-foreground)]">{lead.city || "—"}</td>
                    <td>
                      <div className="flex flex-col gap-0.5">
                        {lead.email && <span className="flex items-center gap-1 text-xs text-emerald-400"><Mail className="w-3 h-3" /> {lead.email}</span>}
                        {lead.phone && <span className="flex items-center gap-1 text-xs text-sky-400"><Phone className="w-3 h-3" /> {lead.phone}</span>}
                        {!lead.email && !lead.phone && <span className="text-xs text-[var(--muted-foreground)]">—</span>}
                      </div>
                    </td>
                    <td><span className={`font-semibold ${lead.score >= 70 ? "text-orange-400" : lead.score >= 40 ? "text-yellow-400" : "text-slate-400"}`}>{lead.score}</span></td>
                    <td><span className={`badge ${STATUS_BADGE[lead.status] || "badge-gray"}`}>{lead.status}</span></td>
                    <td>
                      <div className="flex items-center gap-1">
                        {lead.status === "new" && <button onClick={() => handleAnalyze(lead.id)} className="btn btn-ghost btn-sm p-1.5" title="Analizza"><BarChart3 className="w-4 h-4" /></button>}
                        {(lead.status === "analyzed" || lead.status === "new") && <button onClick={() => handleGenerate(lead.id)} className="btn btn-ghost btn-sm p-1.5" title="Genera"><Sparkles className="w-4 h-4" /></button>}
                        <button onClick={() => handleDelete(lead.id)} className="btn btn-ghost btn-sm p-1.5 text-red-400" title="Elimina"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn btn-outline btn-sm"><ChevronLeft className="w-4 h-4" /> Prec</button>
              <span className="text-sm text-[var(--muted-foreground)]">{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn btn-outline btn-sm">Succ <ChevronRight className="w-4 h-4" /></button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
