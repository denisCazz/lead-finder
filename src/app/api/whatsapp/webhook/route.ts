import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendTelegramMessage } from "@/lib/telegram";
import { classifyWhatsAppReply } from "@/lib/openai";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "bitora_webhook_2024";

/**
 * GET — Meta verification handshake.
 * When you register the webhook URL in developers.facebook.com,
 * Meta sends a GET with hub.mode, hub.challenge, hub.verify_token.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[WhatsApp Webhook] Verification OK");
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * POST — Incoming messages & status updates from Meta.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();

  // Meta always wraps in { object: "whatsapp_business_account", entry: [...] }
  if (body.object !== "whatsapp_business_account") {
    return NextResponse.json({ ok: true });
  }

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value) continue;

      // ── Incoming messages ──
      if (value.messages) {
        for (const msg of value.messages) {
          await handleIncomingMessage(msg, value.contacts?.[0]);
        }
      }

      // ── Status updates (delivered, read, etc.) ──
      if (value.statuses) {
        for (const status of value.statuses) {
          await handleStatusUpdate(status);
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleIncomingMessage(
  msg: { from: string; id: string; type: string; text?: { body: string }; timestamp: string },
  contact?: { profile?: { name?: string } }
) {
  const phone = msg.from; // already in 39xxxxxxxxxx format from Meta
  const text = msg.type === "text" ? msg.text?.body || "" : `[${msg.type}]`;
  const profileName = contact?.profile?.name || null;

  // Upsert chat
  const chat = await prisma.whatsAppChat.upsert({
    where: { phone },
    update: { name: profileName || undefined },
    create: {
      phone,
      name: profileName,
    },
  });

  // Link to lead if not already linked
  if (!chat.leadId) {
    // Try to find a lead by phone (match with or without country code)
    const shortPhone = phone.startsWith("39") ? phone.slice(2) : phone;
    const lead = await prisma.lead.findFirst({
      where: {
        OR: [
          { phone: { contains: shortPhone } },
          { phone: { contains: phone } },
        ],
      },
    });
    if (lead) {
      await prisma.whatsAppChat.update({
        where: { id: chat.id },
        data: { leadId: lead.id },
      });

      // Mark lead as replied and update CRM fields
      if (lead.status === "contacted" || lead.dealStage === "contacted") {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { status: "replied", dealStage: "replied" },
        });
      }

      // AI classify the reply to determine deal stage
      if (text && text.length > 1 && lead.dealStage !== "won" && lead.dealStage !== "lost") {
        try {
          const classification = await classifyWhatsAppReply({
            messageText: text,
            companyName: lead.companyName,
            sector: lead.sector,
          });

          const newStage = classification.data.dealStage;

          // Only escalate: replied→negotiating→won/lost, never downgrade
          const stageOrder: Record<string, number> = { new: 0, analyzed: 1, contacted: 2, replied: 3, negotiating: 4, won: 5, lost: 5 };
          const currentOrder = stageOrder[lead.dealStage] ?? 0;
          const newOrder = stageOrder[newStage] ?? 0;

          if (newOrder > currentOrder) {
            await prisma.lead.update({
              where: { id: lead.id },
              data: { dealStage: newStage },
            });

            await prisma.activityLog.create({
              data: {
                leadId: lead.id,
                campaignId: lead.campaignId,
                type: "ai_classify",
                message: `🤖 AI classifica risposta ${lead.companyName}: ${newStage} (${classification.data.confidence}) — ${classification.data.summary}`,
                metadata: JSON.stringify(classification.data),
              },
            });

            // Real-time Telegram alert for negotiating leads
            if (newStage === "negotiating") {
              const { notifyNegotiating } = await import("@/lib/telegram");
              await notifyNegotiating({
                companyName: lead.companyName,
                sector: lead.sector,
                city: lead.city,
                phone,
                summary: classification.data.summary,
                suggestedNextAction: classification.data.suggestedNextAction,
              }).catch(() => {});
            }
          }
        } catch {
          // AI classification is optional, don't block the webhook
        }
      }
    }
  }

  // Save the message
  await prisma.whatsAppMessage.create({
    data: {
      chatId: chat.id,
      waId: msg.id,
      direction: "in",
      body: text,
      status: "delivered",
    },
  });

  // Notify on Telegram
  const displayName = profileName || chat.name || phone;
  await sendTelegramMessage(
    `📱 <b>Nuovo messaggio WhatsApp</b>\n\n👤 <b>${displayName}</b> (${phone})\n💬 ${text.substring(0, 500)}`
  ).catch(() => {});

  console.log(`[WhatsApp Webhook] Incoming from ${phone}: ${text.substring(0, 100)}`);
}

async function handleStatusUpdate(
  status: { id: string; status: string; recipient_id?: string }
) {
  // Map Meta statuses to our statuses
  const statusMap: Record<string, string> = {
    sent: "sent",
    delivered: "delivered",
    read: "read",
    failed: "failed",
  };

  const newStatus = statusMap[status.status];
  if (!newStatus) return;

  // Update message status by WhatsApp message ID
  await prisma.whatsAppMessage.updateMany({
    where: { waId: status.id },
    data: { status: newStatus },
  });
}
