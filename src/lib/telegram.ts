const TELEGRAM_API = "https://api.telegram.org/bot";

export type TelegramLeadSummary = {
  id: number;
  companyName: string;
  sector: string | null;
  city: string | null;
  website: string | null;
  score: number;
  issues?: string;
};

function getConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return null;
  return { token, chatId };
}

export async function sendTelegramMessage(text: string, inlineKeyboard?: InlineKeyboard): Promise<boolean> {
  const config = getConfig();
  if (!config) {
    console.warn("Telegram not configured, skipping notification");
    return false;
  }

  const body: Record<string, unknown> = {
    chat_id: config.chatId,
    text,
    parse_mode: "HTML",
  };

  if (inlineKeyboard) {
    body.reply_markup = { inline_keyboard: inlineKeyboard };
  }

  const res = await fetch(`${TELEGRAM_API}${config.token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error("Telegram send failed:", await res.text());
    return false;
  }
  return true;
}

type InlineKeyboard = Array<Array<{ text: string; url?: string; callback_data?: string }>>;

function isRealUrl(url: string): boolean {
  return url.startsWith("https://") && !url.includes("localhost") && !url.includes("127.0.0.1");
}

export async function notifyNewLead(lead: {
  id: number;
  companyName: string;
  sector: string | null;
  city: string | null;
  website: string | null;
  score: number;
  issues?: string;
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const text = `🔔 <b>Nuovo Lead Trovato</b>

🏢 <b>${escapeHtml(lead.companyName)}</b>
📍 ${escapeHtml(lead.city || "N/A")} | 🏷 ${escapeHtml(lead.sector || "N/A")}
🌐 ${lead.website || "Nessun sito"}
⭐ Score: ${lead.score}/100
${lead.issues ? `\n⚠️ Problemi: ${escapeHtml(lead.issues)}` : ""}`;

  const leadUrl = `${appUrl}/leads/${lead.id}`;
  const keyboard: InlineKeyboard | undefined = isRealUrl(leadUrl)
    ? [[{ text: "📝 Vedi in Dashboard", url: leadUrl }]]
    : undefined;

  return sendTelegramMessage(text, keyboard);
}

export async function notifyLeadBatch(data: {
  leads: TelegramLeadSummary[];
  batchNumber: number;
  batchSize: number;
  totalCollected: number;
}) {
  const preview = data.leads.slice(0, 8).map((lead, index) => {
    const location = [lead.city, lead.sector].filter(Boolean).join(" • ") || "N/A";
    const site = lead.website ? ` — ${escapeHtml(lead.website)}` : "";
    return `${index + 1}. <b>${escapeHtml(lead.companyName)}</b> (${escapeHtml(location)}) • score ${lead.score}${site}`;
  }).join("\n");

  const remainder = data.leads.length - Math.min(data.leads.length, 8);
  const footer = remainder > 0 ? `\n…e altri ${remainder} lead nello stesso batch.` : "";

  const text = `📦 <b>Batch lead #${data.batchNumber}</b>\n\n`
    + `Nuovi lead raccolti: <b>${data.leads.length}</b>\n`
    + `Totale lead del run: <b>${data.totalCollected}</b>\n`
    + `Soglia batch Telegram: ${data.batchSize}\n\n`
    + `${preview}${footer}`;

  return sendTelegramMessage(text);
}

export async function notifyMessageReady(data: {
  leadId: number;
  messageId: number;
  companyName: string;
  email: string | null;
  phone: string | null;
  preview: string;
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  
  let text = `✉️ <b>Messaggio Pronto</b>

🏢 <b>${escapeHtml(data.companyName)}</b>`;

  if (data.email) {
    text += `\n📧 ${escapeHtml(data.email)}`;
  } else if (data.phone) {
    text += `\n📱 ${escapeHtml(data.phone)} (nessuna email trovata — invio manuale WhatsApp)`;
  }

  text += `\n\n📄 <i>${escapeHtml(data.preview.substring(0, 200))}...</i>`;

  const leadUrl = `${appUrl}/leads/${data.leadId}`;
  const keyboard: InlineKeyboard | undefined = isRealUrl(leadUrl)
    ? [[{ text: "📝 Vedi in Dashboard", url: leadUrl }]]
    : undefined;

  if (!data.email && data.phone && keyboard) {
    keyboard[0].push({
      text: "📱 Apri WhatsApp",
      url: `https://wa.me/39${data.phone.replace(/\D/g, "")}`,
    });
  }

  return sendTelegramMessage(text, keyboard);
}

export async function notifyDailySummary(stats: {
  newLeads: number;
  analyzed: number;
  messagesGenerated: number;
  messagesSent: number;
  errors?: string[];
  campaignsCreated?: number;
  campaignsProcessed?: number;
  whatsappSent?: number;
  repliesReceived?: number;
  negotiating?: { companyName: string; sector: string | null }[];
  wonCount?: number;
  scheduledFollowUps?: number;
}) {
  let text = `📊 <b>Riepilogo Automazione</b>

🆕 Nuovi lead: ${stats.newLeads}
🔍 Analizzati: ${stats.analyzed}
✉️ Testi generati: ${stats.messagesGenerated}
📧 Email inviate: ${stats.messagesSent}`;

  if (stats.whatsappSent !== undefined) {
    text += `\n📱 WhatsApp inviati: ${stats.whatsappSent}`;
  }
  if (stats.repliesReceived !== undefined) {
    text += `\n💬 Risposte ricevute: ${stats.repliesReceived}`;
  }

  text += `\n🚀 Campagne create: ${stats.campaignsCreated ?? 0}
🎯 Campagne processate: ${stats.campaignsProcessed ?? 0}`;

  if (stats.negotiating && stats.negotiating.length > 0) {
    text += `\n\n🤝 <b>In trattativa (${stats.negotiating.length}):</b>`;
    for (const n of stats.negotiating.slice(0, 10)) {
      text += `\n• ${escapeHtml(n.companyName)}${n.sector ? ` (${escapeHtml(n.sector)})` : ""}`;
    }
  }

  if (stats.wonCount) {
    text += `\n\n✅ Lead chiusi (won): ${stats.wonCount}`;
  }

  if (stats.scheduledFollowUps) {
    text += `\n⏰ Follow-up programmati domani: ${stats.scheduledFollowUps}`;
  }

  text += `\n❌ Errori: ${stats.errors?.length ?? 0}`;
  if (stats.errors && stats.errors.length > 0) {
    text += `\n\nDettagli:\n${stats.errors.slice(0, 5).map((error) => `• ${escapeHtml(error)}`).join("\n")}`;
  }

  return sendTelegramMessage(text);
}

export async function notifyNegotiating(data: {
  companyName: string;
  sector: string | null;
  city: string | null;
  phone: string;
  summary: string;
  suggestedNextAction: string;
}) {
  const text = `🤝 <b>Nuovo lead in TRATTATIVA!</b>

🏢 <b>${escapeHtml(data.companyName)}</b>
📍 ${escapeHtml(data.city || "N/A")} | 🏷 ${escapeHtml(data.sector || "N/A")}
📱 ${escapeHtml(data.phone)}

💬 <i>${escapeHtml(data.summary)}</i>
📋 Azione suggerita: ${escapeHtml(data.suggestedNextAction)}`;

  const waLink = `https://wa.me/${data.phone.replace(/\D/g, "")}`;
  const keyboard: InlineKeyboard = [[{ text: "📱 Rispondi su WhatsApp", url: waLink }]];

  return sendTelegramMessage(text, keyboard);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
