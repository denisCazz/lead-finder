const TELEGRAM_API = "https://api.telegram.org/bot";

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
}) {
  const text = `📊 <b>Riepilogo Giornaliero</b>

🆕 Nuovi lead: ${stats.newLeads}
🔍 Analizzati: ${stats.analyzed}
✉️ Messaggi generati: ${stats.messagesGenerated}
📤 Messaggi inviati: ${stats.messagesSent}`;

  return sendTelegramMessage(text);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
