"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Phone,
  Mail,
  MapPin,
  BarChart3,
  Sparkles,
  Send,
  Copy,
  Check,
  Brain,
  Target,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
} from "lucide-react";

interface LeadDetail {
  id: number;
  companyName: string;
  contactName: string | null;
  sector: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  region: string | null;
  address: string | null;
  source: string | null;
  rating: number | null;
  status: string;
  score: number;
  createdAt: string;
  analyses: Array<{
    id: number;
    performanceScore: number | null;
    hasEcommerce: boolean;
    hasBooking: boolean;
    isMobileFriendly: boolean;
    hasModernDesign: boolean;
    hasCrm: boolean;
    issuesJson: string | null;
    suggestedService: string | null;
    aiDiagnosis: string | null;
    aiScore: number | null;
    aiTokensUsed: number | null;
    analyzedAt: string;
  }>;
  messages: Array<{
    id: number;
    type: string;
    subject: string | null;
    content: string;
    status: string;
    sentAt: string | null;
    createdAt: string;
  }>;
}

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);

  async function fetchLead() {
    const res = await fetch(`/api/leads/${params.id}`);
    if (!res.ok) {
      router.push("/leads");
      return;
    }
    const data = await res.json();
    setLead(data);
    setLoading(false);
  }

  useEffect(() => {
    fetchLead();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function handleAnalyze() {
    setAnalyzing(true);
    await fetch(`/api/analyze/${params.id}`, { method: "POST" });
    await fetchLead();
    setAnalyzing(false);
  }

  async function handleGenerate() {
    setGenerating(true);
    await fetch(`/api/messages/generate/${params.id}`, { method: "POST" });
    await fetchLead();
    setGenerating(false);
  }

  async function handleSendEmail(messageId: number) {
    await fetch(`/api/messages/send/${messageId}`, { method: "POST" });
    await fetchLead();
  }

  async function handleApprove(messageId: number) {
    await fetch(`/api/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });
    await fetchLead();
  }

  function handleCopy(messageId: number, content: string) {
    navigator.clipboard.writeText(content);
    setCopied(messageId);
    setTimeout(() => setCopied(null), 2000);
  }

  if (loading) return <div className="text-center py-16 text-[var(--muted-foreground)]">Caricamento...</div>;
  if (!lead) return null;

  const latestAnalysis = lead.analyses[0];
  const issues = latestAnalysis?.issuesJson ? JSON.parse(latestAnalysis.issuesJson) : [];

  return (
    <div>
      <Link href="/leads" className="inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] mb-6">
        <ArrowLeft className="w-4 h-4" /> Torna ai Lead
      </Link>

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">{lead.companyName}</h1>
          <div className="flex items-center gap-4 mt-2 text-sm text-[var(--muted-foreground)]">
            {lead.sector && <span className="bg-[var(--muted)] px-2 py-0.5 rounded">{lead.sector}</span>}
            {lead.city && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {lead.city}</span>}
            {lead.source && <span>Fonte: {lead.source}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:opacity-90 disabled:opacity-50 text-sm font-medium flex items-center gap-2"
          >
            <BarChart3 className="w-4 h-4" />
            {analyzing ? "Analisi..." : "Analizza"}
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg hover:opacity-90 disabled:opacity-50 text-sm font-medium flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            {generating ? "Generazione..." : "Genera Messaggio"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contact Info */}
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
          <h2 className="text-lg font-semibold mb-4">Contatti</h2>
          <div className="space-y-3 text-sm">
            {lead.contactName && (
              <div><span className="text-[var(--muted-foreground)]">Referente:</span> {lead.contactName}</div>
            )}
            {lead.email && (
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-[var(--muted-foreground)]" />
                <a href={`mailto:${lead.email}`} className="text-[var(--primary)] hover:underline">{lead.email}</a>
              </div>
            )}
            {lead.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-[var(--muted-foreground)]" />
                <a href={`tel:${lead.phone}`} className="text-[var(--primary)] hover:underline">{lead.phone}</a>
              </div>
            )}
            {lead.website && (
              <div className="flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-[var(--muted-foreground)]" />
                <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] hover:underline truncate">
                  {lead.website}
                </a>
              </div>
            )}
            {lead.address && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[var(--muted-foreground)]" />
                <span>{lead.address}</span>
              </div>
            )}
            {lead.rating && (
              <div><span className="text-[var(--muted-foreground)]">Rating:</span> {lead.rating}/5</div>
            )}
          </div>
        </div>

        {/* Analysis */}
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
          <h2 className="text-lg font-semibold mb-4">Analisi</h2>
          {!latestAnalysis ? (
            <p className="text-sm text-[var(--muted-foreground)]">Non ancora analizzato</p>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[var(--muted-foreground)]">Score</span>
                <span className={`text-2xl font-bold ${
                  lead.score >= 70 ? "text-red-400" : lead.score >= 40 ? "text-yellow-400" : "text-green-400"
                }`}>
                  {lead.score}/100
                </span>
              </div>
              {latestAnalysis.performanceScore !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-[var(--muted-foreground)]">Performance</span>
                  <span>{latestAnalysis.performanceScore}/100</span>
                </div>
              )}
              <div className="space-y-1.5">
                {[
                  { label: "E-commerce", value: latestAnalysis.hasEcommerce },
                  { label: "Prenotazioni", value: latestAnalysis.hasBooking },
                  { label: "Mobile-friendly", value: latestAnalysis.isMobileFriendly },
                  { label: "Design moderno", value: latestAnalysis.hasModernDesign },
                  { label: "CRM/Gestionale", value: latestAnalysis.hasCrm },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-[var(--muted-foreground)]">{item.label}</span>
                    <span className={item.value ? "text-green-400" : "text-red-400"}>
                      {item.value ? "\u2713" : "\u2717"}
                    </span>
                  </div>
                ))}
              </div>
              {issues.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[var(--border)]">
                  <p className="text-[var(--muted-foreground)] mb-2">Problemi:</p>
                  <ul className="space-y-1">
                    {issues.map((issue: string, i: number) => (
                      <li key={i} className="text-red-400 text-xs">\u26a0 {issue}</li>
                    ))}
                  </ul>
                </div>
              )}
              {latestAnalysis.suggestedService && (
                <div className="mt-3 pt-3 border-t border-[var(--border)]">
                  <p className="text-[var(--muted-foreground)]">Servizio suggerito:</p>
                  <p className="font-medium text-[var(--accent)]">{latestAnalysis.suggestedService}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Status */}
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
          <h2 className="text-lg font-semibold mb-4">Stato</h2>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[var(--muted-foreground)]">Stato attuale</span>
              <span className={`text-xs px-2 py-1 rounded-full ${
                lead.status === "new" ? "bg-blue-500/20 text-blue-400" :
                lead.status === "analyzed" ? "bg-yellow-500/20 text-yellow-400" :
                lead.status === "contacted" ? "bg-green-500/20 text-green-400" :
                "bg-gray-500/20 text-gray-400"
              }`}>
                {lead.status}
              </span>
            </div>
            <div>
              <span className="text-[var(--muted-foreground)]">Creato:</span>{" "}
              {new Date(lead.createdAt).toLocaleDateString("it-IT")}
            </div>
            <div>
              <span className="text-[var(--muted-foreground)]">Messaggi:</span> {lead.messages.length}
            </div>
            {latestAnalysis?.aiScore !== null && latestAnalysis?.aiScore !== undefined && (
              <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
                <span className="text-[var(--muted-foreground)]">AI Score</span>
                <span className={`text-lg font-bold ${
                  latestAnalysis.aiScore >= 70 ? "text-red-400" : latestAnalysis.aiScore >= 40 ? "text-yellow-400" : "text-green-400"
                }`}>
                  {latestAnalysis.aiScore}/100
                </span>
              </div>
            )}
            {latestAnalysis?.aiTokensUsed !== null && latestAnalysis?.aiTokensUsed !== undefined && (
              <div className="text-xs text-[var(--muted-foreground)]">
                AI tokens: {latestAnalysis.aiTokensUsed}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Diagnosis */}
      {latestAnalysis?.aiDiagnosis && (() => {
        try {
          const diag = JSON.parse(latestAnalysis.aiDiagnosis);
          return (
            <div className="mt-6 bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-xl border border-purple-500/30 p-6">
              <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                <Brain className="w-5 h-5 text-purple-400" />
                Diagnosi AI
                {diag.confidence && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ml-2 ${
                    diag.confidence === "alta" ? "bg-green-500/20 text-green-400" :
                    diag.confidence === "media" ? "bg-yellow-500/20 text-yellow-400" :
                    "bg-gray-500/20 text-gray-400"
                  }`}>
                    Confidenza: {diag.confidence}
                  </span>
                )}
              </h2>

              {/* What they do */}
              {diag.whatTheyDo && (
                <p className="text-sm mb-4">{diag.whatTheyDo}</p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                {/* Strengths */}
                {diag.strengths?.length > 0 && (
                  <div>
                    <h3 className="flex items-center gap-1.5 font-medium text-green-400 mb-2">
                      <TrendingUp className="w-4 h-4" /> Punti di Forza
                    </h3>
                    <ul className="space-y-1">
                      {diag.strengths.map((s: string, i: number) => (
                        <li key={i} className="text-[var(--muted-foreground)] text-xs">✓ {s}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Weaknesses */}
                {diag.weaknesses?.length > 0 && (
                  <div>
                    <h3 className="flex items-center gap-1.5 font-medium text-red-400 mb-2">
                      <AlertTriangle className="w-4 h-4" /> Criticità
                    </h3>
                    <ul className="space-y-1">
                      {diag.weaknesses.map((w: string, i: number) => (
                        <li key={i} className="text-[var(--muted-foreground)] text-xs">✗ {w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Opportunities */}
                {diag.opportunities?.length > 0 && (
                  <div>
                    <h3 className="flex items-center gap-1.5 font-medium text-yellow-400 mb-2">
                      <Lightbulb className="w-4 h-4" /> Opportunità
                    </h3>
                    <ul className="space-y-1">
                      {diag.opportunities.map((o: string, i: number) => (
                        <li key={i} className="text-[var(--muted-foreground)] text-xs">→ {o}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Suggested Approach */}
                {diag.suggestedApproach && (
                  <div>
                    <h3 className="flex items-center gap-1.5 font-medium text-purple-400 mb-2">
                      <Target className="w-4 h-4" /> Approccio Consigliato
                    </h3>
                    <p className="text-[var(--muted-foreground)] text-xs">{diag.suggestedApproach}</p>
                  </div>
                )}
              </div>

              {/* Personalized Hook */}
              {diag.personalizedHook && (
                <div className="mt-4 pt-4 border-t border-purple-500/20">
                  <p className="text-xs text-[var(--muted-foreground)]">Gancio personalizzato per email:</p>
                  <p className="text-sm italic text-purple-300 mt-1">&ldquo;{diag.personalizedHook}&rdquo;</p>
                </div>
              )}
            </div>
          );
        } catch {
          return null;
        }
      })()}

      {/* Messages */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-4">Messaggi ({lead.messages.length})</h2>
        {lead.messages.length === 0 ? (
          <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-8 text-center text-[var(--muted-foreground)]">
            Nessun messaggio generato. Clicca &ldquo;Genera Messaggio&rdquo; per crearne uno.
          </div>
        ) : (
          <div className="space-y-4">
            {lead.messages.map((msg) => (
              <div key={msg.id} className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      msg.status === "draft" ? "bg-gray-500/20 text-gray-400" :
                      msg.status === "approved" ? "bg-blue-500/20 text-blue-400" :
                      msg.status === "sent" ? "bg-green-500/20 text-green-400" :
                      "bg-red-500/20 text-red-400"
                    }`}>
                      {msg.status}
                    </span>
                    <span className="text-xs text-[var(--muted-foreground)]">{msg.type}</span>
                    <span className="text-xs text-[var(--muted-foreground)]">
                      {new Date(msg.createdAt).toLocaleDateString("it-IT")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopy(msg.id, msg.content)}
                      className="p-1.5 rounded hover:bg-[var(--muted)] text-[var(--muted-foreground)]"
                      title="Copia"
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
                    {(msg.status === "approved" || msg.status === "draft") && lead.email && (
                      <button
                        onClick={() => handleSendEmail(msg.id)}
                        className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:opacity-90 flex items-center gap-1"
                      >
                        <Send className="w-3 h-3" /> Invia Email
                      </button>
                    )}
                  </div>
                </div>
                {msg.subject && (
                  <p className="text-sm font-medium mb-2">Oggetto: {msg.subject}</p>
                )}
                <p className="text-sm whitespace-pre-wrap text-[var(--muted-foreground)]">{msg.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
