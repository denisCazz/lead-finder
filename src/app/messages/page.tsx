"use client";

import { useState, useEffect, useCallback } from "react";
import { MessageSquare, Send, Copy, Check, Eye } from "lucide-react";

interface Message {
  id: number;
  type: string;
  subject: string | null;
  content: string;
  status: string;
  sentAt: string | null;
  createdAt: string;
  lead: {
    id: number;
    companyName: string;
    email: string | null;
    phone: string | null;
  };
}

export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [copied, setCopied] = useState<number | null>(null);
  const [preview, setPreview] = useState<Message | null>(null);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/messages?${params}`);
    const data = await res.json();
    setMessages(data.messages || []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  async function handleSend(messageId: number) {
    await fetch(`/api/messages/send/${messageId}`, { method: "POST" });
    fetchMessages();
  }

  async function handleApprove(messageId: number) {
    await fetch(`/api/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });
    fetchMessages();
  }

  function handleCopy(messageId: number, content: string) {
    navigator.clipboard.writeText(content);
    setCopied(messageId);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <MessageSquare className="w-7 h-7 sm:w-8 sm:h-8 text-[var(--primary)]" />
            Messaggi
          </h1>
          <p className="text-[var(--muted-foreground)] mt-1 text-sm">{messages.length} messaggi</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] text-sm"
        >
          <option value="">Tutti</option>
          <option value="draft">Bozze</option>
          <option value="approved">Approvati</option>
          <option value="sent">Inviati</option>
          <option value="failed">Falliti</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-16 text-[var(--muted-foreground)]">Caricamento...</div>
      ) : messages.length === 0 ? (
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-8 text-center text-[var(--muted-foreground)]">
          Nessun messaggio trovato
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((msg) => (
            <div key={msg.id} className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    msg.status === "draft" ? "bg-gray-500/20 text-gray-400" :
                    msg.status === "approved" ? "bg-blue-500/20 text-blue-400" :
                    msg.status === "sent" ? "bg-green-500/20 text-green-400" :
                    "bg-red-500/20 text-red-400"
                  }`}>
                    {msg.status}
                  </span>
                  <a href={`/leads/${msg.lead.id}`} className="text-[var(--primary)] hover:underline font-medium text-sm">
                    {msg.lead.companyName}
                  </a>
                  {msg.subject && (
                    <span className="text-sm text-[var(--muted-foreground)] truncate max-w-xs sm:max-w-md">
                      {msg.subject}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPreview(preview?.id === msg.id ? null : msg)}
                    className="p-1.5 rounded hover:bg-[var(--muted)] text-[var(--muted-foreground)]"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleCopy(msg.id, msg.content)}
                    className="p-1.5 rounded hover:bg-[var(--muted)] text-[var(--muted-foreground)]"
                  >
                    {copied === msg.id ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                  {msg.status === "draft" && (
                    <button
                      onClick={() => handleApprove(msg.id)}
                      className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:opacity-90"
                    >
                      Approva
                    </button>
                  )}
                  {(msg.status === "approved" || msg.status === "draft") && msg.lead.email && (
                    <button
                      onClick={() => handleSend(msg.id)}
                      className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:opacity-90 flex items-center gap-1"
                    >
                      <Send className="w-3 h-3" /> Invia
                    </button>
                  )}
                </div>
              </div>
              {preview?.id === msg.id && (
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
