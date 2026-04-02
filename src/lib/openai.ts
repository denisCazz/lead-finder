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
  detectedTechs: string[];
}): Promise<AiResult<SiteDiagnosis>> {
  const userPrompt = `Analizza questo sito web:

Nome Azienda: ${input.companyName}
Settore: ${input.sector || "Non specificato"}
Sito: ${input.website}
Titolo pagina: ${input.pageTitle || "N/A"}
Meta description: ${input.metaDescription || "N/A"}
Performance PageSpeed: ${input.performanceScore !== null ? `${input.performanceScore}/100` : "Non disponibile"}

Risultati scan tecnico:
- E-commerce: ${input.hasEcommerce ? "Sì" : "No"}
- Prenotazione online: ${input.hasBooking ? "Sì" : "No"}
- Mobile-friendly: ${input.isMobileFriendly ? "Sì" : "No"}
- Design moderno: ${input.hasModernDesign ? "Sì" : "No"}
- CRM/Area Clienti: ${input.hasCrm ? "Sì" : "No"}
- Tecnologie rilevate: ${input.detectedTechs.length > 0 ? input.detectedTechs.join(", ") : "Nessuna rilevata"}

Contenuto testuale del sito (primi ~3000 caratteri):
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
      return JSON.parse(cleaned);
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
}): { problem: string; service: string } {
  if (issues.performanceScore !== null && issues.performanceScore !== undefined && issues.performanceScore < 50) {
    return {
      problem: `Il sito ci mette troppo a caricare (performance score: ${issues.performanceScore}/100)`,
      service: "Rifacimento Sito Web ad alte performance",
    };
  }
  if (!issues.hasEcommerce) {
    return {
      problem: "Non hanno un e-commerce o un sistema per vendere online",
      service: "E-commerce custom",
    };
  }
  if (!issues.hasBooking) {
    return {
      problem: "Non hanno un sistema per prenotare online",
      service: "Sistema di prenotazione online",
    };
  }
  if (!issues.isMobileFriendly) {
    return {
      problem: "Il sito non è ottimizzato per mobile",
      service: "Rifacimento Sito Web responsive e performante",
    };
  }
  if (!issues.hasModernDesign) {
    return {
      problem: "Il sito ha un design datato che non trasmette professionalità",
      service: "Rifacimento Sito Web moderno",
    };
  }
  if (!issues.hasCrm) {
    return {
      problem: "Gestiscono ancora clienti e lavori con fogli Excel o carta e penna",
      service: "Gestionale/CRM su misura",
    };
  }
  return {
    problem: "Il sito ha margini di miglioramento significativi",
    service: "Sito Web ad alte performance",
  };
}
