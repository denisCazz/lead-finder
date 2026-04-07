import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { sendTelegramMessage } from "@/lib/telegram";
import { sendWhatsAppTemplate, sendWhatsAppText, isWhatsAppConfigured, logOutgoingToChat } from "@/lib/whatsapp";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await params;
  const message = await prisma.message.findUnique({
    where: { id: parseInt(messageId) },
    include: { lead: true },
  });

  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  // ── WhatsApp send path ──
  if (message.type === "whatsapp" || (!message.lead.email && message.lead.phone)) {
    if (!message.lead.phone) {
      return NextResponse.json({ error: "Lead has no phone number" }, { status: 400 });
    }

    // Try WhatsApp Cloud API if configured
    if (isWhatsAppConfigured()) {
      const waContent = message.whatsappContent || message.content;
      const serviceHook = waContent.substring(0, 120);

      const result = await sendWhatsAppTemplate(message.lead.phone, {
        contactName: message.lead.contactName || message.lead.companyName,
        serviceHook,
      });

      if (result.success) {
        await prisma.message.update({
          where: { id: message.id },
          data: { status: "sent", sentAt: new Date() },
        });
        await prisma.lead.update({
          where: { id: message.leadId },
          data: { status: "contacted" },
        });
        await prisma.activityLog.create({
          data: {
            leadId: message.lead.id,
            campaignId: message.lead.campaignId,
            type: "send",
            message: `📱 WhatsApp inviato a ${message.lead.companyName} (${result.recipientPhone})`,
            metadata: JSON.stringify({ messageId: message.id, waMessageId: result.messageId }),
          },
        });
        // Log to chat history
        const templateText = `Ciao ${message.lead.contactName || message.lead.companyName}, sono Denis di Bitora. Ho dato un'occhiata al vostro sito e credo di potervi aiutare con ${serviceHook}. Posso mandarvi una breve analisi gratuita? Buona giornata!`;
        await logOutgoingToChat(message.lead.phone!, templateText, result.messageId, message.lead.id).catch(() => {});
        return NextResponse.json({ success: true, channel: "whatsapp", waMessageId: result.messageId });
      }

      // WhatsApp failed — log and fall through to Telegram notification
      await prisma.activityLog.create({
        data: {
          leadId: message.lead.id,
          campaignId: message.lead.campaignId,
          type: "send",
          message: `⚠️ WhatsApp fallito per ${message.lead.companyName}: ${result.error}`,
        },
      });
    }

    // Fallback: notify on Telegram with WhatsApp click link
    const waText = message.whatsappContent || message.content;
    const phone = message.lead.phone.replace(/\D/g, "");
    const waLink = `https://wa.me/39${phone}?text=${encodeURIComponent(waText)}`;

    await sendTelegramMessage(
      `📱 <b>WhatsApp da inviare</b>\n\n🏢 <b>${message.lead.companyName}</b>\n📞 ${message.lead.phone}\n\n📄 <i>${waText.substring(0, 300)}...</i>\n\n👆 Clicca il bottone per aprire WhatsApp precompilato`,
      [[{ text: "📱 Invia su WhatsApp", url: waLink }]]
    );

    return NextResponse.json({
      success: true,
      channel: "telegram_fallback",
      note: isWhatsAppConfigured()
        ? "WhatsApp API fallito, link inviato su Telegram"
        : "WhatsApp API non configurato, link inviato su Telegram",
    });
  }

  // ── Email send path ──
  if (!message.lead.email) {
    await sendTelegramMessage(
      `📱 <b>Invio manuale richiesto</b>\n\n🏢 ${message.lead.companyName}\n📞 ${message.lead.phone || "N/A"}\n\n📄 ${message.content.substring(0, 300)}...`
    );
    return NextResponse.json({ error: "Lead has no email. Notification sent to Telegram." }, { status: 400 });
  }

  const result = await sendEmail({
    to: message.lead.email,
    subject: message.subject || "Collaborazione",
    body: message.content,
  });

  if (result.success) {
    await prisma.message.update({
      where: { id: message.id },
      data: { status: "sent", sentAt: new Date() },
    });
    await prisma.lead.update({
      where: { id: message.leadId },
      data: { status: "contacted" },
    });
    return NextResponse.json({ success: true, channel: "email" });
  } else {
    await prisma.message.update({
      where: { id: message.id },
      data: { status: "failed" },
    });
    return NextResponse.json({ success: false, error: result.error }, { status: 500 });
  }
}
