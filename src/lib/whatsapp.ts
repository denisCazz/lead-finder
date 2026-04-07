/**
 * WhatsApp Cloud API integration (Meta Business Platform)
 *
 * Required env vars:
 *   WHATSAPP_TOKEN          – Permanent token from Meta Business
 *   WHATSAPP_PHONE_ID       – Phone number ID from WhatsApp Business
 *   WHATSAPP_TEMPLATE_NAME  – Approved template name (default: "bitora_intro")
 *   WHATSAPP_TEMPLATE_LANG  – Template language (default: "it")
 *
 * Setup guide:
 * 1. Go to https://business.facebook.com → Impostazioni → WhatsApp
 * 2. Create a WhatsApp Business app at https://developers.facebook.com/apps/
 * 3. In the app dashboard: WhatsApp → API Setup
 * 4. Add your business phone number and verify it
 * 5. Generate a permanent token (System User → Generate Token)
 * 6. Create a message template at WhatsApp → Message Templates:
 *    - Name: "bitora_intro"
 *    - Category: "MARKETING"
 *    - Language: "it"
 *    - Body: "Ciao {{1}}, sono Denis di Bitora. Ho dato un'occhiata al vostro sito e credo di potervi aiutare con {{2}}. Posso mandarvi una breve analisi gratuita? Buona giornata!"
 *    - {{1}} = company name or contact name
 *    - {{2}} = suggested service / problem
 * 7. Wait for template approval (usually 1-24h)
 * 8. Set the env vars in your .env or Docker config
 */

const GRAPH_API = "https://graph.facebook.com/v22.0";

interface WhatsAppConfig {
  token: string;
  phoneId: string;
  templateName: string;
  templateLang: string;
}

function getConfig(): WhatsAppConfig | null {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) return null;
  return {
    token,
    phoneId,
    templateName: process.env.WHATSAPP_TEMPLATE_NAME || "bitora_intro",
    templateLang: process.env.WHATSAPP_TEMPLATE_LANG || "it",
  };
}

export function isWhatsAppConfigured(): boolean {
  return getConfig() !== null;
}

/**
 * Normalize an Italian phone number to WhatsApp format (39xxxxxxxxxx).
 * Accepts: +39 347 123 4567, 347-123-4567, 0039347..., 3471234567, etc.
 */
function normalizeToWhatsApp(phone: string): string | null {
  const digits = phone.replace(/[^\d]/g, "");

  // Already has country code
  if (digits.startsWith("39") && digits.length >= 11 && digits.length <= 13) {
    return digits;
  }
  // Starts with 00 (international prefix)
  if (digits.startsWith("0039")) {
    return digits.slice(2);
  }
  // Italian mobile without prefix (3xx...)
  if (digits.startsWith("3") && digits.length >= 9 && digits.length <= 10) {
    return "39" + digits;
  }
  // Italian landline without prefix — not suitable for WhatsApp
  if (digits.startsWith("0")) {
    return null;
  }
  return null;
}

export { normalizeToWhatsApp };

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  recipientPhone?: string;
}

/**
 * Log an outgoing message to the WhatsApp chat history.
 * Creates the chat if it doesn't exist yet.
 */
export async function logOutgoingToChat(phone: string, body: string, waId?: string, leadId?: number): Promise<void> {
  // Lazy import to avoid circular deps
  const { prisma } = await import("@/lib/db");

  const normalized = normalizeToWhatsApp(phone);
  if (!normalized) return;

  const chat = await prisma.whatsAppChat.upsert({
    where: { phone: normalized },
    update: { updatedAt: new Date() },
    create: { phone: normalized, leadId: leadId || null },
  });

  await prisma.whatsAppMessage.create({
    data: {
      chatId: chat.id,
      waId: waId || null,
      direction: "out",
      body,
      status: "sent",
    },
  });
}

/**
 * Send a template message (for first contact / cold outreach).
 * Template messages are the only type allowed when the user hasn't
 * messaged you first (outside the 24h conversation window).
 */
export async function sendWhatsAppTemplate(
  phone: string,
  params: { contactName: string; serviceHook: string }
): Promise<WhatsAppSendResult> {
  const config = getConfig();
  if (!config) {
    return { success: false, error: "WhatsApp non configurato. Imposta WHATSAPP_TOKEN e WHATSAPP_PHONE_ID." };
  }

  const to = normalizeToWhatsApp(phone);
  if (!to) {
    return { success: false, error: `Numero non valido per WhatsApp: ${phone}` };
  }

  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: config.templateName,
      language: { code: config.templateLang },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: params.contactName.substring(0, 60) },
            { type: "text", text: params.serviceHook.substring(0, 120) },
          ],
        },
      ],
    },
  };

  try {
    const res = await fetch(`${GRAPH_API}/${config.phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (res.ok && data.messages?.[0]?.id) {
      console.log(`[WhatsApp] Template sent to ${to}: ${data.messages[0].id}`);
      return { success: true, messageId: data.messages[0].id, recipientPhone: to };
    }

    const errorMsg = data.error?.message || JSON.stringify(data);
    console.error(`[WhatsApp] Template send failed:`, errorMsg);
    return { success: false, error: errorMsg, recipientPhone: to };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[WhatsApp] Network error:`, msg);
    return { success: false, error: msg };
  }
}

/**
 * Send a free-form text message (only works within 24h conversation window,
 * i.e. after the recipient has replied to a template message).
 * Use this for follow-ups.
 */
export async function sendWhatsAppText(
  phone: string,
  text: string
): Promise<WhatsAppSendResult> {
  const config = getConfig();
  if (!config) {
    return { success: false, error: "WhatsApp non configurato." };
  }

  const to = normalizeToWhatsApp(phone);
  if (!to) {
    return { success: false, error: `Numero non valido per WhatsApp: ${phone}` };
  }

  const body = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  };

  try {
    const res = await fetch(`${GRAPH_API}/${config.phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (res.ok && data.messages?.[0]?.id) {
      console.log(`[WhatsApp] Text sent to ${to}: ${data.messages[0].id}`);
      return { success: true, messageId: data.messages[0].id, recipientPhone: to };
    }

    const errorMsg = data.error?.message || JSON.stringify(data);
    console.error(`[WhatsApp] Text send failed:`, errorMsg);
    return { success: false, error: errorMsg, recipientPhone: to };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}
