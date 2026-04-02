import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { sendTelegramMessage } from "@/lib/telegram";

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Telegram webhook sends update objects
  const callbackQuery = body.callback_query;
  if (!callbackQuery) {
    return NextResponse.json({ ok: true });
  }

  const data = callbackQuery.data as string;
  const chatId = callbackQuery.message?.chat?.id;

  // Acknowledge the callback
  await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQuery.id }),
    }
  );

  if (data.startsWith("approve_")) {
    const messageId = parseInt(data.replace("approve_", ""));
    await prisma.message.update({
      where: { id: messageId },
      data: { status: "approved" },
    });
    await sendTelegramMessage(`✅ Messaggio #${messageId} approvato.`);
  } else if (data.startsWith("send_")) {
    const messageId = parseInt(data.replace("send_", ""));
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: { lead: true },
    });

    if (message && message.lead.email) {
      const result = await sendEmail({
        to: message.lead.email,
        subject: message.subject || "Collaborazione",
        body: message.content,
      });

      if (result.success) {
        await prisma.message.update({
          where: { id: messageId },
          data: { status: "sent", sentAt: new Date() },
        });
        await prisma.lead.update({
          where: { id: message.leadId },
          data: { status: "contacted" },
        });
        await sendTelegramMessage(`📧 Email inviata a ${message.lead.companyName}!`);
      } else {
        await sendTelegramMessage(`❌ Errore invio a ${message.lead.companyName}: ${result.error}`);
      }
    } else {
      await sendTelegramMessage(`⚠️ Nessuna email per questo lead. Procedi via WhatsApp.`);
    }
  } else if (data.startsWith("skip_")) {
    const messageId = parseInt(data.replace("skip_", ""));
    await prisma.message.update({
      where: { id: messageId },
      data: { status: "draft" },
    });
    await sendTelegramMessage(`⏭ Messaggio #${messageId} rimesso in bozza.`);
  }

  return NextResponse.json({ ok: true });
}
