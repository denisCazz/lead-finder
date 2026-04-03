import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { notifyDailySummary } from "@/lib/telegram";

/**
 * MORNING CRON — runs at ~09:00
 * Auto-approves high-score leads and sends emails up to the daily cap.
 * Respects settings: auto_send_enabled, max_emails_per_day, auto_send_min_score.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  const envSecret = process.env.CRON_SECRET;
  const mask = (s: string | null | undefined) =>
    s ? `${s.slice(0, 3)}***${s.slice(-2)} (len=${s.length})` : "(not set)";
  console.log(`[cron/morning] x-cron-secret received: ${mask(secret)}`);
  console.log(`[cron/morning] CRON_SECRET env:         ${mask(envSecret)}`);
  if (envSecret && secret !== envSecret) {
    console.error(`[cron/morning] AUTH FAILED — header=${mask(secret)} env=${mask(envSecret)}`);
    return NextResponse.json({
      error: "Unauthorized",
      _debug: {
        headerReceived: !!secret,
        envSecretSet: !!envSecret,
        lengthMatch: secret?.length === envSecret?.length,
        headerLen: secret?.length ?? 0,
        envLen: envSecret?.length ?? 0,
      },
    }, { status: 403 });
  }

  // Load settings
  const settingsRows = await prisma.setting.findMany({
    where: { key: { in: ["auto_send_enabled", "max_emails_per_day", "auto_send_min_score", "email_from"] } },
  });
  const settings = Object.fromEntries(settingsRows.map((s) => [s.key, s.value]));

  if (settings.auto_send_enabled !== "true") {
    return NextResponse.json({ skipped: true, reason: "auto_send_enabled is false" });
  }

  const maxPerDay = parseInt(settings.max_emails_per_day || "20", 10);
  const minScore = parseInt(settings.auto_send_min_score || "70", 10);
  const emailFrom = settings.email_from || process.env.EMAIL_FROM || "noreply@bitora.it";

  // Count emails already sent today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const sentToday = await prisma.message.count({
    where: { status: "sent", sentAt: { gte: todayStart } },
  });

  if (sentToday >= maxPerDay) {
    return NextResponse.json({ skipped: true, reason: `Daily cap reached (${sentToday}/${maxPerDay})` });
  }

  const remaining = maxPerDay - sentToday;

  // Find draft email messages for high-score leads with email addresses
  const candidates = await prisma.message.findMany({
    where: {
      status: "draft",
      type: "email",
      lead: {
        email: { not: null },
        score: { gte: minScore },
      },
    },
    include: { lead: true },
    take: remaining,
    orderBy: { createdAt: "asc" },
  });

  const stats = { sent: 0, failed: 0, errors: [] as string[] };

  for (const message of candidates) {
    if (!message.lead.email) continue;

    const result = await sendEmail({
      to: message.lead.email,
      subject: message.subject || "Una proposta per voi",
      body: message.content,
      from: emailFrom,
    });

    if (result.success) {
      await prisma.message.update({
        where: { id: message.id },
        data: { status: "sent", sentAt: new Date() },
      });
      await prisma.lead.update({
        where: { id: message.lead.id },
        data: { status: "contacted" },
      });
      await prisma.activityLog.create({
        data: {
          leadId: message.lead.id,
          campaignId: message.lead.campaignId,
          type: "send",
          message: `📧 Email inviata a ${message.lead.companyName} <${message.lead.email}>`,
          metadata: JSON.stringify({ messageId: message.id, score: message.lead.score }),
        },
      });
      stats.sent++;
    } else {
      await prisma.message.update({
        where: { id: message.id },
        data: { status: "failed" },
      });
      await prisma.activityLog.create({
        data: {
          leadId: message.lead.id,
          type: "send",
          message: `❌ Invio fallito per ${message.lead.companyName}: ${result.error}`,
        },
      });
      stats.failed++;
      stats.errors.push(`${message.lead.companyName}: ${result.error}`);
    }
  }

  // Summary notification
  try {
    await notifyDailySummary({
      newLeads: 0,
      analyzed: 0,
      messagesGenerated: 0,
      messagesSent: stats.sent,
    });
  } catch { /* telegram optional */ }

  return NextResponse.json({ ...stats, cap: maxPerDay, sentTodayBefore: sentToday });
}

export const GET = POST; // allows cron services that send GET
