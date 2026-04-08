import OpenAI from "openai";
import { getPrompt, getAllPrompts } from "@/lib/prompts";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── AI Response wrapper with token tracking ───────────────────────────
export interface AiResult<T> {
  data: T;
  tokensUsed: number;
  model: string;
  durationMs: number;
}

async function callGpt<T>(
  systemPrompt: string,
  userPrompt: string,
  parse: (text: string) => T,
  opts?: { temperature?: number; maxTokens?: number }
): Promise<AiResult<T>> {
  const start = Date.now();
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: opts?.temperature ?? 0.7,
    max_tokens: opts?.maxTokens ?? 1000,
  });
  const durationMs = Date.now() - start;
  const text = response.choices[0]?.message?.content || "";
  const tokensUsed = response.usage?.total_tokens ?? 0;

  return {
    data: parse(text),
    tokensUsed,
    model: "gpt-4o",
    durationMs,
  };
}

// Cache prompts for pipeline runs (avoids repeated DB queries within a single pipeline)
let _cachedPrompts: Record<string, string> | null = null;

export async function loadPrompts(): Promise<Record<string, string>> {
  _cachedPrompts = await getAllPrompts();
  return _cachedPrompts;
}

export function clearPromptCache() {
  _cachedPrompts = null;
}

async function getSystemPrompt(key: string): Promise<string> {
  if (_cachedPrompts?.[key]) return _cachedPrompts[key];
  return getPrompt(key);
}

// ─── 1. AI Campaign Planner ────────────────────────────────────────────
export interface CampaignPlan {
  campaignName: string;
  sector: string;
  city: string | null;
  region: string | null;
  reasoning: string;
  targetProfile: string;
  expectedService: string;
}

export async function planCampaignWithAI(prompt: string): Promise<AiResult<CampaignPlan>> {
  const systemPrompt = await getSystemPrompt("prompt_campaign_plan");
  return callGpt<CampaignPlan>(
    systemPrompt,
    `Richiesta dell'utente: "${prompt}"`,
    (text) => {
      const cleaned = text.replace(/```json\n?|```/g, "").trim();
      return JSON.parse(cleaned);
    },
    { temperature: 0.6, maxTokens: 500 }
  );
}

// ─── 2. AI Website Diagnosis ───────────────────────────────────────────
export interface SiteDiagnosis {
  whatTheyDo: string;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  suggestedApproach: string;
  personalizedHook: string;
  aiScore: number;
  confidence: string;
}

export async function diagnoseSiteWithAI(input: {
  companyName: string;
  sector: string | null;
  website: string;
  pageTitle: string;
  metaDescription: string;
  extractedText: string;
  performanceScore: number | null;
  hasEcommerce: boolean;
  hasBooking: boolean;
  isMobileFriendly: boolean;
  hasModernDesign: boolean;
  hasCrm: boolean;
  hasAnalytics?: boolean;
  hasSocialPresence?: boolean;
  hasWhatsappWidget?: boolean;
  hasContactForm?: boolean;
  detectedTechs: string[];
}): Promise<AiResult<SiteDiagnosis>> {
  const userPrompt = `Analizza questo sito web per conto di Denis (Bitora.it — agenzia digitale per PMI):

Nome Azienda: ${input.companyName}
Settore: ${input.sector || "Non specificato"}
Sito: ${input.website}
Titolo pagina: ${input.pageTitle || "N/A"}
Meta description: ${input.metaDescription || "N/A"}
Performance PageSpeed (mobile): ${input.performanceScore !== null ? `${input.performanceScore}/100` : "Non rilevato (probabilmente lento o non raggiungibile)"}

Risultati scan tecnico:
- E-commerce: ${input.hasEcommerce ? "Sì" : "No"}
- Prenotazione online: ${input.hasBooking ? "Sì" : "No"}
- Mobile-friendly: ${input.isMobileFriendly ? "Sì" : "No"}
- Design moderno: ${input.hasModernDesign ? "Sì" : "No"}
- CRM/Area Clienti: ${input.hasCrm ? "Sì" : "No"}
- Analytics (GA/FB Pixel): ${input.hasAnalytics ? "Sì" : "No"}
- Presenza social collegata: ${input.hasSocialPresence ? "Sì" : "No"}
- Widget WhatsApp: ${input.hasWhatsappWidget ? "Sì" : "No"}
- Form di contatto: ${input.hasContactForm ? "Sì" : "No"}
- Tecnologie rilevate: ${input.detectedTechs.length > 0 ? input.detectedTechs.join(", ") : "Nessuna rilevata"}

Contenuto testuale del sito (primi ~4000 caratteri):
${input.extractedText || "Contenuto non disponibile"}`;

  const systemPrompt = await getSystemPrompt("prompt_diagnosis");
  return callGpt<SiteDiagnosis>(
    systemPrompt,
    userPrompt,
    (text) => {
      const cleaned = text.replace(/```json\n?|```/g, "").trim();
      return JSON.parse(cleaned);
    },
    { temperature: 0.5, maxTokens: 800 }
  );
}

// ─── 3. AI Lead Qualification ──────────────────────────────────────────
export interface LeadQualification {
  priority: string;
  reason: string;
  bestTiming: string;
  suggestedChannel: string;
  recommendedAction: "send_now" | "review_manually" | "do_not_contact";
}

export async function qualifyLeadWithAI(input: {
  companyName: string;
  sector: string | null;
  score: number;
  diagnosis: SiteDiagnosis;
}): Promise<AiResult<LeadQualification>> {
  const userPrompt = `Lead da qualificare:
Nome: ${input.companyName}
Settore: ${input.sector || "N/A"}
Score tecnico: ${input.score}/100
Score AI: ${input.diagnosis.aiScore}/100
Cosa fanno: ${input.diagnosis.whatTheyDo}
Punti deboli: ${input.diagnosis.weaknesses.join(", ")}
Opportunità: ${input.diagnosis.opportunities.join(", ")}
Approccio suggerito: ${input.diagnosis.suggestedApproach}
Confidence: ${input.diagnosis.confidence}`;

  const qualPrompt = await getSystemPrompt("prompt_qualification");
  return callGpt<LeadQualification>(
    qualPrompt,
    userPrompt,
    (text) => {
      const cleaned = text.replace(/```json\n?|```/g, "").trim();
      const parsed = JSON.parse(cleaned) as Partial<LeadQualification>;
      const fallbackAction = parsed.priority === "scartare"
        ? "do_not_contact"
        : parsed.suggestedChannel === "email"
          ? "send_now"
          : "review_manually";

      return {
        priority: parsed.priority || "media",
        reason: parsed.reason || "Lead da rivedere manualmente",
        bestTiming: parsed.bestTiming || "subito",
        suggestedChannel: parsed.suggestedChannel || "email",
        recommendedAction: parsed.recommendedAction || fallbackAction,
      };
    },
    { temperature: 0.4, maxTokens: 300 }
  );
}

// ─── 4. Cold Email Generation (enhanced with AI context) ───────────────
export interface MessageGenerationInput {
  companyName: string;
  contactName: string | null;
  sector: string | null;
  problem: string;
  suggestedService: string;
  aiDiagnosis?: SiteDiagnosis | null;
}

export async function generateColdEmail(input: MessageGenerationInput): Promise<AiResult<{ subject: string; body: string }>> {
  let userPrompt = `Genera l'email basandoti su questi dati:

Nome Azienda Target: ${input.companyName}
Nome Referente: ${input.contactName || "Titolare"}
Settore: ${input.sector || "Non specificato"}
Problema Rilevato dallo Scraper: ${input.problem}
Soluzione Bitora da Proporre: ${input.suggestedService}`;

  // Enrich with AI diagnosis context for better personalization
  if (input.aiDiagnosis) {
    userPrompt += `

CONTESTO AI AVANZATO (usa questi dettagli per personalizzare al massimo):
- Cosa fa l'azienda: ${input.aiDiagnosis.whatTheyDo}
- Punti deboli digitali: ${input.aiDiagnosis.weaknesses.join("; ")}
- Opportunità: ${input.aiDiagnosis.opportunities.join("; ")}
- Gancio personalizzato suggerito: ${input.aiDiagnosis.personalizedHook}
- Approccio consigliato: ${input.aiDiagnosis.suggestedApproach}

IMPORTANTE: Usa il gancio personalizzato come apertura dell'email. Rendi il messaggio ultra-specifico per questa azienda.`;
  }

  const emailPrompt = await getSystemPrompt("prompt_email");
  return callGpt<{ subject: string; body: string }>(
    emailPrompt,
    userPrompt,
    (text) => {
      const subjectMatch = text.match(/^Oggetto:\s*(.+)/m);
      const subject = subjectMatch ? subjectMatch[1].trim() : "Collaborazione";
      const body = text.replace(/^Oggetto:\s*.+\n*/m, "").trim();
      return { subject, body };
    },
    { temperature: 0.8, maxTokens: 500 }
  );
}

export function mapIssuesToProblemString(issues: {
  performanceScore?: number | null;
  hasEcommerce?: boolean;
  hasBooking?: boolean;
  isMobileFriendly?: boolean;
  hasModernDesign?: boolean;
  hasCrm?: boolean;
  sector?: string | null;
  aiDiagnosis?: SiteDiagnosis | null;
}): { problem: string; service: string } {
  // If we have an AI diagnosis, use its insights as the ONLY source.
  // The AI has read the site content and understands what the business does.
  if (issues.aiDiagnosis) {
    const diag = issues.aiDiagnosis;
    if (diag.weaknesses.length > 0 && diag.suggestedApproach) {
      return {
        problem: diag.weaknesses[0],
        service: diag.suggestedApproach,
      };
    }
  }

  // Fallback (no AI diagnosis): only use universally-relevant technical issues.
  // Do NOT suggest e-commerce, booking, or CRM based on boolean flags alone —
  // we can't know if they're relevant without understanding the business.
  const problems: { problem: string; service: string; weight: number }[] = [];

  if (issues.performanceScore !== null && issues.performanceScore !== undefined && issues.performanceScore < 50) {
    problems.push({
      problem: `Il sito è molto lento (performance ${issues.performanceScore}/100) — i clienti lo abbandonano prima di vederlo`,
      service: "Ottimizzazione e rifacimento sito web performante",
      weight: 90,
    });
  }

  if (!issues.isMobileFriendly) {
    problems.push({
      problem: "Il sito non funziona bene da smartphone — oggi il 70% del traffico arriva da mobile",
      service: "Sito web responsive ottimizzato per mobile",
      weight: 85,
    });
  }

  if (!issues.hasModernDesign) {
    problems.push({
      problem: "Il sito ha un design datato che non trasmette professionalità ai potenziali clienti",
      service: "Rifacimento sito web con design moderno e professionale",
      weight: 70,
    });
  }

  // Sort by weight and return the most impactful issue
  problems.sort((a, b) => b.weight - a.weight);

  if (problems.length > 0) {
    return { problem: problems[0].problem, service: problems[0].service };
  }

  return {
    problem: "Il sito ha margini di miglioramento per attrarre più clienti online",
    service: "Strategia digitale e ottimizzazione della presenza online",
  };
}

// ─── 5. WhatsApp Message Generation ───────────────────────────────────
export async function generateWhatsAppMessage(input: {
  companyName: string;
  sector: string | null;
  problem: string;
  suggestedService: string;
  personalizedHook?: string | null;
}): Promise<AiResult<string>> {
  const whatsappPrompt = await getSystemPrompt("prompt_whatsapp");
  const userPrompt = `Genera il messaggio WhatsApp per:
Nome Azienda: ${input.companyName}
Settore: ${input.sector || "Non specificato"}
Problema rilevato: ${input.problem}
Soluzione da proporre: ${input.suggestedService}${input.personalizedHook ? `\nDettaglio specifico da usare: ${input.personalizedHook}` : ""}`;

  return callGpt<string>(
    whatsappPrompt,
    userPrompt,
    (text) => text.trim(),
    { temperature: 0.85, maxTokens: 200 }
  );
}

// ─── 6. AI City Suggestions ────────────────────────────────────────────
export interface CitySuggestion {
  city: string;
  region: string;
  reasoning: string;
  estimatedLeads: number;
  priority: "alta" | "media" | "bassa";
}

export async function suggestNewCities(input: {
  sector: string;
  alreadyWorkedCities: { city: string; region?: string | null; leadsFound: number }[];
}): Promise<AiResult<CitySuggestion[]>> {
  const cityPrompt = await getSystemPrompt("prompt_city_suggestion");
  const cityList = input.alreadyWorkedCities
    .map((c) => `- ${c.city}${c.region ? ` (${c.region})` : ""}: ${c.leadsFound} lead trovati`)
    .join("\n");

  const userPrompt = `Settore target: ${input.sector}

Città già lavorate (da NON riproporre):
${cityList || "Nessuna ancora"}

Suggerisci 5 nuove città italiane con alto potenziale per questo settore.`;

  return callGpt<CitySuggestion[]>(
    cityPrompt,
    userPrompt,
    (text) => {
      const cleaned = text.replace(/```json\n?|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return parsed.suggestions ?? parsed;
    },
    { temperature: 0.6, maxTokens: 600 }
  );
}

// ─── 7. AI WhatsApp Reply Classification ───────────────────────────────
export interface ReplyClassification {
  dealStage: "negotiating" | "won" | "lost" | "replied";
  confidence: "alta" | "media" | "bassa";
  summary: string;
  suggestedNextAction: string;
}

export async function classifyWhatsAppReply(input: {
  messageText: string;
  companyName: string;
  sector: string | null;
  previousContext?: string | null;
}): Promise<AiResult<ReplyClassification>> {
  const systemPrompt = `Sei un assistente commerciale per Bitora (agenzia digitale italiana).
Analizza il messaggio WhatsApp ricevuto da un potenziale cliente e classifica la sua intenzione.

Rispondi SOLO con un JSON valido:
{
  "dealStage": "negotiating" | "won" | "lost" | "replied",
  "confidence": "alta" | "media" | "bassa",
  "summary": "breve riassunto del messaggio (max 100 char)",
  "suggestedNextAction": "cosa fare dopo (max 150 char)"
}

Regole:
- "negotiating": il cliente mostra interesse, chiede info, prezzi, preventivo, vuole sapere di più
- "won": il cliente accetta esplicitamente, vuole procedere, conferma l'ordine
- "lost": il cliente rifiuta chiaramente, dice no grazie, non interessato, chiede di non essere contattato
- "replied": messaggio ambiguo o irrilevante (saluto generico, emoji, domanda non correlata)

NON essere troppo aggressivo nella classificazione. Se in dubbio, usa "replied".`;

  const userPrompt = `Azienda: ${input.companyName}
Settore: ${input.sector || "Non specificato"}
${input.previousContext ? `Contesto precedente: ${input.previousContext}\n` : ""}
Messaggio ricevuto:
"${input.messageText}"`;

  return callGpt<ReplyClassification>(
    systemPrompt,
    userPrompt,
    (text) => {
      const cleaned = text.replace(/```json\n?|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return {
        dealStage: ["negotiating", "won", "lost", "replied"].includes(parsed.dealStage) ? parsed.dealStage : "replied",
        confidence: parsed.confidence || "bassa",
        summary: parsed.summary || "",
        suggestedNextAction: parsed.suggestedNextAction || "",
      };
    },
    { temperature: 0.3, maxTokens: 200 }
  );
}

// ─── 8. AI Follow-up Message Generation ────────────────────────────────
export async function generateFollowUpMessage(input: {
  companyName: string;
  contactName: string | null;
  sector: string | null;
  originalMessage: string;
  followUpNumber: number;
  channel: "email" | "whatsapp";
}): Promise<AiResult<{ subject?: string; body: string }>> {
  const systemPrompt = `Sei Denis di Bitora (agenzia digitale per PMI italiane).
Genera un messaggio di follow-up ${input.channel === "email" ? "email" : "WhatsApp"} breve e non aggressivo.

Regole IMPORTANTI:
- Sii cordiale e professionale, MAI insistente o spam
- Il follow-up deve aggiungere valore (suggerimento, dato utile, domanda pertinente)
- Se è WhatsApp: max 3-4 righe, tono informale ma professionale
- Se è email: oggetto breve + corpo max 5-6 righe
- NON ripetere lo stesso messaggio originale
- Follow-up #1: leggero reminder con valore aggiunto
- Follow-up #2: ultimo messaggio, offri aiuto e chiudi gentilmente
${input.channel === "email" ? '\nFormato: "Oggetto: ...\n\n[corpo email]"' : "\nFormato: solo il testo del messaggio WhatsApp"}`;

  const userPrompt = `Azienda: ${input.companyName}
Referente: ${input.contactName || "Titolare"}
Settore: ${input.sector || "Non specificato"}
Follow-up numero: ${input.followUpNumber} di 2 massimo
Messaggio originale inviato: "${input.originalMessage.substring(0, 300)}"`;

  return callGpt<{ subject?: string; body: string }>(
    systemPrompt,
    userPrompt,
    (text) => {
      if (input.channel === "email") {
        const subjectMatch = text.match(/^Oggetto:\s*(.+)/m);
        const subject = subjectMatch ? subjectMatch[1].trim() : "Seguito alla mia proposta";
        const body = text.replace(/^Oggetto:\s*.+\n*/m, "").trim();
        return { subject, body };
      }
      return { body: text.trim() };
    },
    { temperature: 0.8, maxTokens: 300 }
  );
}
