"use client";

import { useState, useEffect, useCallback } from "react";
import { MessageSquare, Send, Copy, Check, Eye, EyeOff } from "lucide-react";

interface Message {
  id: number;
  type: string;
  subject: string | null;
  content: string;
  status: string;
  sentAt: string | null;
  createdAt: string;
  lead: { id: number; companyName: string; email: string | null; phone: string | null };
}

const STATUS_BADGE: Record<string, string> = {
  draft: "badge-gray",
  approved: "badge-blue",
  sent: "badge-green",
  failed: "badge-red",
};

export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [copied, setCopied] = useState<number | null>(null);
  const [preview, setPreview] = useState<number | null>(null);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/messages?${params}`);
    const data = await res.json();
    setMessages(data.messages || []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  async function handleSend(messageId: number) { await fetch(`/api/messages/send/${messageId}`, { method: "POST" }); fetchMessages(); }
  async function handleApprove(messageId: number) { await fetch(`/api/messages/${messageId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "approved" }) }); fetchMessages(); }

  function handleCopy(messageId: number, content: string) {
    navigator.clipboard.writeText(content);
    setCopied(messageId);
    setTimeout(() => setCopied(null), 2000);
  }

  const summary = {
    total: messages.length,
    drafts: messages.filter((m) => m.status === "draft").length,
    approved: messages.filter((m) => m.status === "approved").length,
    sent: messages.filter((m) => m.status === "sent").length,
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"><MessageSquare className="w-6 h-6 text-[var(--primary)]" /> Messaggi</h1>
          <p className="page-subtitle">{messages.length} messaggi</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Totali", value: summary.total, color: "text-[var(--foreground)]" },
          { label: "Bozze", value: summary.drafts, color: "text-slate-400" },
          { label: "Approvati", value: summary.approved, color: "text-blue-400" },
          { label: "Inviati", value: summary.sent, color: "text-emerald-400" },
        ].map((item) => (
          <div key={item.label} className="kpi-card">
            <p className="kpi-label">{item.label}</p>
            <p className={`kpi-value ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input w-auto min-w-[160px]">
          <option value="">Tutti</option>
          <option value="draft">Bozze</option>
          <option value="approved">Approvati</option>
          <option value="sent">Inviati</option>
          <option value="failed">Falliti</option>
        </select>
        <p className="text-sm text-[var(--muted-foreground)] hidden sm:block">
          L&apos;AI approva automaticamente i messaggi pronti. Da qui controlli o forzi casi specifici.
        </p>
      </div>

      {loading ? (
        <div className="empty-state"><p>Caricamento...</p></div>
      ) : messages.length === 0 ? (
        <div className="section-card empty-state">
          <MessageSquare className="w-12 h-12" />
          <p>Nessun messaggio trovato</p>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((msg) => (
            <div key={msg.id} className="section-card p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`badge ${STATUS_BADGE[msg.status] || "badge-gray"}`}>{msg.status}</span>
                    <a href={`/leads/${msg.lead.id}`} className="text-[var(--primary)] hover:underline font-medium text-sm">{msg.lead.companyName}</a>
                    {msg.subject && <span className="text-sm text-[var(--muted-foreground)] truncate max-w-xs">{msg.subject}</span>}
                  </div>
                  <div className="mt-1.5 text-xs text-[var(--muted-foreground)] flex flex-wrap gap-x-4">
                    <span>{msg.lead.email || msg.lead.phone || "Nessun contatto"}</span>
                    <span>Creato: {new Date(msg.createdAt).toLocaleString("it-IT")}</span>
                    {msg.sentAt && <span>Inviato: {new Date(msg.sentAt).toLocaleString("it-IT")}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setPreview(preview === msg.id ? null : msg.id)} className="btn btn-ghost btn-sm p-1.5">
                    {preview === msg.id ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button onClick={() => handleCopy(msg.id, msg.content)} className="btn btn-ghost btn-sm p-1.5">
                    {copied === msg.id ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                  {msg.status === "draft" && <button onClick={() => handleApprove(msg.id)} className="btn btn-outline btn-sm">Approva</button>}
                  {(msg.status === "approved" || msg.status === "draft") && msg.lead.email && (
                    <button onClick={() => handleSend(msg.id)} className="btn btn-success btn-sm"><Send className="w-3.5 h-3.5" /> Invia</button>
                  )}
                </div>
              </div>
              {preview === msg.id && (
                <div className="mt-3 pt-3 border-t border-[var(--border)]">
                  {msg.subject && <p className="text-sm font-medium mb-2">Oggetto: {msg.subject}</p>}
                  <p className="text-sm whitespace-pre-wrap text-[var(--muted-foreground)]">{msg.content}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
