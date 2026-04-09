import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeToWhatsApp } from "@/lib/whatsapp";

/**
 * POST /api/whatsapp/backfill — Reconstruct WhatsApp chat history
 * from already-sent Message records that were never logged to WhatsAppChat/WhatsAppMessage.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  const envSecret = process.env.CRON_SECRET;
  if (envSecret && secret !== envSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Find all WhatsApp messages that were sent
  const sentMessages = await prisma.message.findMany({
    where: {
      type: "whatsapp",
      status: "sent",
    },
    include: {
      lead: true,
    },
    orderBy: { sentAt: "asc" },
  });

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const msg of sentMessages) {
    if (!msg.lead.phone) {
      skipped++;
      continue;
    }

    const normalized = normalizeToWhatsApp(msg.lead.phone);
    if (!normalized) {
      skipped++;
      continue;
    }

    // Check if this message was already logged by looking for an existing
    // outgoing WhatsAppMessage around the same timestamp
    const existingChat = await prisma.whatsAppChat.findUnique({
      where: { phone: normalized },
    });

    // Extract waMessageId from activity log metadata if available
    let waMessageId: string | null = null;
    try {
      const log = await prisma.activityLog.findFirst({
        where: {
          leadId: msg.leadId,
          type: "send",
          message: { contains: "WhatsApp inviato" },
          metadata: { contains: `"messageId":${msg.id}` },
        },
      });
      if (log?.metadata) {
        const meta = JSON.parse(log.metadata);
        waMessageId = meta.waMessageId || null;
      }
    } catch {
      // metadata parsing failed, continue without waId
    }

    // If chat exists, check if an outgoing message with same waId or similar time exists
    if (existingChat && waMessageId) {
      const alreadyLogged = await prisma.whatsAppMessage.findFirst({
        where: { chatId: existingChat.id, waId: waMessageId },
      });
      if (alreadyLogged) {
        skipped++;
        continue;
      }
    }

    try {
      // Upsert chat
      const chat = await prisma.whatsAppChat.upsert({
        where: { phone: normalized },
        update: {},
        create: {
          phone: normalized,
          leadId: msg.lead.id,
        },
      });

      // Link lead if not linked
      if (!chat.leadId) {
        await prisma.whatsAppChat.update({
          where: { id: chat.id },
          data: { leadId: msg.lead.id },
        });
      }

      // Reconstruct the template text
      const waContent = msg.whatsappContent || msg.content;
      const serviceHook = waContent.substring(0, 120);
      const templateText = `Ciao ${msg.lead.contactName || msg.lead.companyName}, sono Denis di Bitora. Ho dato un'occhiata al vostro sito e credo di potervi aiutare con ${serviceHook}. Posso mandarvi una breve analisi gratuita? Buona giornata!`;

      await prisma.whatsAppMessage.create({
        data: {
          chatId: chat.id,
          waId: waMessageId,
          direction: "out",
          body: templateText,
          status: "sent",
          createdAt: msg.sentAt || msg.createdAt,
        },
      });

      created++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push(`Lead ${msg.lead.companyName} (msg ${msg.id}): ${errMsg}`);
    }
  }

  return NextResponse.json({
    success: true,
    total: sentMessages.length,
    created,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
  });
}
