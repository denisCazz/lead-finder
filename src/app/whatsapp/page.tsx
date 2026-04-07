"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MessageCircle, Send, ArrowLeft, User, Phone, Building2 } from "lucide-react";
import Link from "next/link";

interface ChatSummary {
  id: number;
  phone: string;
  name: string | null;
  leadId: number | null;
  leadName: string | null;
  leadSector: string | null;
  lastMessage: string | null;
  lastMessageDir: string | null;
  lastMessageAt: string;
}

interface ChatMessage {
  id: number;
  direction: "in" | "out";
  body: string;
  status: string;
  createdAt: string;
}

interface ChatDetail {
  id: number;
  phone: string;
  name: string | null;
  lead: { id: number; companyName: string; sector: string | null; email: string | null; phone: string | null } | null;
}

export default function WhatsAppChatPage() {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [chatDetail, setChatDetail] = useState<ChatDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch chat list
  const fetchChats = useCallback(async () => {
    const res = await fetch("/api/whatsapp/chats");
    const data = await res.json();
    setChats(data.chats || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchChats();
    // Poll for new chats every 10s
    const iv = setInterval(fetchChats, 10000);
    return () => clearInterval(iv);
  }, [fetchChats]);

  // Fetch messages for selected chat
  const fetchMessages = useCallback(async (chatId: number) => {
    const res = await fetch(`/api/whatsapp/chats/${chatId}`);
    const data = await res.json();
    setChatDetail(data.chat);
    setMessages(data.messages || []);
  }, []);

  useEffect(() => {
    if (!selectedChatId) return;
    fetchMessages(selectedChatId);
    // Poll for new messages every 5s
    pollRef.current = setInterval(() => fetchMessages(selectedChatId), 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [selectedChatId, fetchMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!replyText.trim() || !selectedChatId) return;
    setSending(true);
    const res = await fetch(`/api/whatsapp/chats/${selectedChatId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: replyText.trim() }),
    });
    const data = await res.json();
    if (data.message) {
      setMessages((prev) => [...prev, data.message]);
    }
    setReplyText("");
    setSending(false);
    fetchChats(); // refresh sidebar
  }

  function formatTime(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  }

  function statusIcon(status: string) {
    if (status === "read") return "✓✓";
    if (status === "delivered") return "✓✓";
    if (status === "sent") return "✓";
    if (status === "failed") return "✗";
    return "";
  }

  const displayName = (chat: ChatSummary) => chat.name || chat.leadName || chat.phone;

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2 mb-6">
        <MessageCircle className="w-7 h-7 sm:w-8 sm:h-8 text-green-500" />
        Chat WhatsApp
      </h1>

      <div className="flex bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden" style={{ height: "calc(100vh - 180px)", minHeight: "500px" }}>
        {/* ── Chat list (left) ── */}
        <div className={`w-full sm:w-80 sm:min-w-[320px] border-r border-[var(--border)] flex flex-col ${selectedChatId ? "hidden sm:flex" : "flex"}`}>
          <div className="p-3 border-b border-[var(--border)]">
            <p className="text-sm font-medium text-[var(--muted-foreground)]">
              {chats.length} conversazion{chats.length === 1 ? "e" : "i"}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="text-center py-8 text-[var(--muted-foreground)] text-sm">Caricamento...</div>
            ) : chats.length === 0 ? (
              <div className="text-center py-8 text-[var(--muted-foreground)] text-sm px-4">
                Nessuna conversazione ancora.<br />Le chat appariranno quando i lead rispondono ai messaggi WhatsApp.
              </div>
            ) : (
              chats.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => setSelectedChatId(chat.id)}
                  className={`w-full text-left p-3 border-b border-[var(--border)] hover:bg-[var(--muted)] transition-colors ${
                    selectedChatId === chat.id ? "bg-[var(--muted)]" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-600/20 flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-green-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm truncate">{displayName(chat)}</p>
                        <span className="text-xs text-[var(--muted-foreground)] whitespace-nowrap">
                          {formatTime(chat.lastMessageAt)}
                        </span>
                      </div>
                      {chat.leadName && chat.name && (
                        <p className="text-xs text-[var(--muted-foreground)] truncate">{chat.leadName}</p>
                      )}
                      <p className="text-xs text-[var(--muted-foreground)] truncate mt-0.5">
                        {chat.lastMessageDir === "out" && <span className="text-green-400">Tu: </span>}
                        {chat.lastMessage || "..."}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── Chat view (right) ── */}
        <div className={`flex-1 flex flex-col ${selectedChatId ? "flex" : "hidden sm:flex"}`}>
          {!selectedChatId ? (
            <div className="flex-1 flex items-center justify-center text-[var(--muted-foreground)] text-sm">
              Seleziona una conversazione
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="p-3 border-b border-[var(--border)] flex items-center gap-3">
                <button
                  onClick={() => setSelectedChatId(null)}
                  className="sm:hidden p-1 rounded hover:bg-[var(--muted)]"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="w-9 h-9 rounded-full bg-green-600/20 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-green-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">
                    {chatDetail?.name || chatDetail?.phone}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{chatDetail?.phone}</span>
                    {chatDetail?.lead && (
                      <Link href={`/leads/${chatDetail.lead.id}`} className="flex items-center gap-1 text-blue-400 hover:underline">
                        <Building2 className="w-3 h-3" />{chatDetail.lead.companyName}
                      </Link>
                    )}
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2" style={{ background: "rgba(0,0,0,0.15)" }}>
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.direction === "out" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${
                        msg.direction === "out"
                          ? "bg-green-700/80 text-white rounded-br-sm"
                          : "bg-[var(--card)] text-[var(--foreground)] rounded-bl-sm"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                      <div className={`text-[10px] mt-1 text-right ${msg.direction === "out" ? "text-green-200/60" : "text-[var(--muted-foreground)]"}`}>
                        {formatTime(msg.createdAt)}
                        {msg.direction === "out" && (
                          <span className={`ml-1 ${msg.status === "read" ? "text-blue-300" : ""}`}>
                            {statusIcon(msg.status)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply input */}
              <div className="p-3 border-t border-[var(--border)] flex items-end gap-2">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Scrivi un messaggio..."
                  rows={1}
                  className="flex-1 px-3 py-2 rounded-xl bg-[var(--muted)] border border-[var(--border)] text-[var(--foreground)] text-sm resize-none max-h-32"
                  style={{ minHeight: "40px" }}
                />
                <button
                  onClick={handleSend}
                  disabled={!replyText.trim() || sending}
                  className="p-2.5 bg-green-600 text-white rounded-full hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
