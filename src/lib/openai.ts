import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `Sei un esperto di vendite B2B e copywriting persuasivo. Il tuo compito è scrivere un messaggio di contatto a freddo (cold email o messaggio LinkedIn) per conto di Bitora (bitora.it), un'agenzia tech specializzata in sistemi digitali su misura (E-commerce, Gestionali, CRM, CMMS, Siti Web ad alte performance, Tessere NFC).

Il tuo obiettivo: Non vendere il servizio nell'email, ma incuriosire il cliente per ottenere una risposta o fissare una call conoscitiva di 15 minuti.

Regole rigide che devi rispettare:
- Tono: Diretto, professionale ma informale. Assolutamente non "robotico" o eccessivamente formale.
- Niente cliché: Vieta frasi come "Spero che questa email la trovi bene", "Siamo un'azienda leader", o "Le scrivo per presentarle". Vai dritto al punto.
- Lunghezza massima: 100-120 parole. I manager non leggono i muri di testo.
- Struttura obbligatoria:
  1. Hook (Gancio): Apri menzionando un dettaglio specifico che abbiamo notato sulla loro azienda o un problema reale.
  2. Ponte/Soluzione: Collega il problema a un servizio specifico di Bitora (senza fare l'elenco della spesa di tutto ciò che facciamo).
  3. Call to Action (CTA): Chiudi sempre con una domanda a bassissima frizione (es. "Ha senso parlarne?", "È una priorità per voi in questo momento?").

Rispondi SOLO con il messaggio email, senza commenti aggiuntivi. Includi un oggetto email nella prima riga nel formato "Oggetto: ..."`;

export interface MessageGenerationInput {
  companyName: string;
  contactName: string | null;
  sector: string | null;
  problem: string;
  suggestedService: string;
}

export async function generateColdEmail(input: MessageGenerationInput): Promise<{ subject: string; body: string }> {
  const userPrompt = `Genera l'email basandoti esclusivamente su questi dati:

Nome Azienda Target: ${input.companyName}
Nome Referente: ${input.contactName || "Titolare"}
Settore: ${input.sector || "Non specificato"}
Problema Rilevato dallo Scraper: ${input.problem}
Soluzione Bitora da Proporre: ${input.suggestedService}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.8,
    max_tokens: 500,
  });

  const text = response.choices[0]?.message?.content || "";
  
  const subjectMatch = text.match(/^Oggetto:\s*(.+)/m);
  const subject = subjectMatch ? subjectMatch[1].trim() : "Collaborazione";
  const body = text.replace(/^Oggetto:\s*.+\n*/m, "").trim();

  return { subject, body };
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
