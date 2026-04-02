"use client";

import { useState, useEffect, useCallback } from "react";
import { Megaphone, Play, Pause, Plus, Loader2 } from "lucide-react";

interface Campaign {
  id: number;
  name: string;
  sector: string;
  region: string | null;
  city: string | null;
  status: string;
  createdAt: string;
  _count: { leads: number };
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [scraping, setScraping] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", sector: "", region: "", city: "" });

  const fetchCampaigns = useCallback(async () => {
    const res = await fetch("/api/campaigns");
    const data = await res.json();
    setCampaigns(data.campaigns || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ name: "", sector: "", region: "", city: "" });
    setShowCreate(false);
    setCreating(false);
    fetchCampaigns();
  }

  async function handleRunScraper(campaignId: number) {
    setScraping(campaignId);
    await fetch("/api/scraper/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId }),
    });
    setScraping(null);
    fetchCampaigns();
  }

  async function toggleStatus(campaignId: number, currentStatus: string) {
    const newStatus = currentStatus === "active" ? "paused" : "active";
    await fetch(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchCampaigns();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Megaphone className="w-8 h-8 text-[var(--primary)]" />
            Campagne
          </h1>
          <p className="text-[var(--muted-foreground)] mt-1">{campaigns.length} campagne</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 text-sm font-medium flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Nuova Campagna
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Crea Nuova Campagna</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[var(--muted-foreground)] mb-1">Nome Campagna *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="es. Ristoranti Milano"
                className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-[var(--foreground)] text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--muted-foreground)] mb-1">Settore *</label>
              <input
                type="text"
                required
                value={form.sector}
                onChange={(e) => setForm({ ...form, sector: e.target.value })}
                placeholder="es. ristorante, hotel, edilizia"
                className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-[var(--foreground)] text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--muted-foreground)] mb-1">Regione</label>
              <input
                type="text"
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
                placeholder="es. Lombardia"
                className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-[var(--foreground)] text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--muted-foreground)] mb-1">Città</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="es. Milano"
                className="w-full px-3 py-2 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-[var(--foreground)] text-sm"
              />
            </div>
            <div className="md:col-span-2 flex gap-3">
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 disabled:opacity-50 text-sm font-medium"
              >
                {creating ? "Creazione..." : "Crea Campagna"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 bg-[var(--muted)] text-[var(--foreground)] rounded-lg hover:opacity-90 text-sm"
              >
                Annulla
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Campaigns List */}
      {loading ? (
        <div className="text-center py-16 text-[var(--muted-foreground)]">Caricamento...</div>
      ) : campaigns.length === 0 ? (
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-8 text-center text-[var(--muted-foreground)]">
          Nessuna campagna. Creane una per iniziare!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((c) => (
            <div key={c.id} className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">{c.name}</h3>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  c.status === "active" ? "bg-green-500/20 text-green-400" :
                  c.status === "paused" ? "bg-yellow-500/20 text-yellow-400" :
                  "bg-gray-500/20 text-gray-400"
                }`}>
                  {c.status}
                </span>
              </div>
              <div className="text-sm text-[var(--muted-foreground)] space-y-1 mb-4">
                <p>Settore: {c.sector}</p>
                {c.city && <p>Città: {c.city}</p>}
                {c.region && <p>Regione: {c.region}</p>}
                <p>Lead trovati: {c._count.leads}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleRunScraper(c.id)}
                  disabled={scraping === c.id}
                  className="flex-1 px-3 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 disabled:opacity-50 text-xs font-medium flex items-center justify-center gap-1"
                >
                  {scraping === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                  {scraping === c.id ? "Scraping..." : "Avvia Scraping"}
                </button>
                <button
                  onClick={() => toggleStatus(c.id, c.status)}
                  className="px-3 py-2 bg-[var(--muted)] text-[var(--foreground)] rounded-lg hover:opacity-90 text-xs flex items-center gap-1"
                >
                  {c.status === "active" ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  {c.status === "active" ? "Pausa" : "Riattiva"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
