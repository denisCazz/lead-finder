import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { sendTelegramMessage } from "@/lib/telegram";

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

  if (!message.lead.email) {
    // No email - notify on Telegram with phone for manual WhatsApp
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
    return NextResponse.json({ success: true });
  } else {
    await prisma.message.update({
      where: { id: message.id },
      data: { status: "failed" },
    });
    return NextResponse.json({ success: false, error: result.error }, { status: 500 });
  }
}
