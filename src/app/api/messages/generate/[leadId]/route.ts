import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateColdEmail, mapIssuesToProblemString } from "@/lib/openai";
import { notifyMessageReady } from "@/lib/telegram";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const { leadId } = await params;
  const lead = await prisma.lead.findUnique({
    where: { id: parseInt(leadId) },
    include: { analyses: { orderBy: { analyzedAt: "desc" }, take: 1 } },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const analysis = lead.analyses[0];
  let problem: string;
  let service: string;

  if (analysis) {
    const mapped = mapIssuesToProblemString({
      performanceScore: analysis.performanceScore,
      hasEcommerce: analysis.hasEcommerce,
      hasBooking: analysis.hasBooking,
      isMobileFriendly: analysis.isMobileFriendly,
      hasModernDesign: analysis.hasModernDesign,
      hasCrm: analysis.hasCrm,
    });
    problem = mapped.problem;
    service = analysis.suggestedService || mapped.service;
  } else {
    problem = "Il sito ha margini di miglioramento significativi";
    service = "Sito Web ad alte performance";
  }

  // Parse AI diagnosis if available
  let aiDiag = null;
  if (analysis?.aiDiagnosis) {
    try { aiDiag = JSON.parse(analysis.aiDiagnosis); } catch { /* ignore */ }
  }

  const emailResult = await generateColdEmail({
    companyName: lead.companyName,
    contactName: lead.contactName,
    sector: lead.sector,
    problem,
    suggestedService: service,
    aiDiagnosis: aiDiag,
  });

  const message = await prisma.message.create({
    data: {
      leadId: lead.id,
      type: "email",
      subject: emailResult.data.subject,
      content: emailResult.data.body,
      status: "draft",
    },
  });

  // Log AI generation
  await prisma.activityLog.create({
    data: {
      leadId: lead.id,
      campaignId: lead.campaignId,
      type: "ai_generate",
      message: `✉️ Email AI generata per ${lead.companyName} — "${emailResult.data.subject}" (${emailResult.tokensUsed} tokens, ${emailResult.durationMs}ms)`,
      metadata: JSON.stringify({
        messageId: message.id,
        tokensUsed: emailResult.tokensUsed,
        model: emailResult.model,
        durationMs: emailResult.durationMs,
        hadAiContext: !!aiDiag,
      }),
    },
  });

  // Notify via Telegram
  await notifyMessageReady({
    leadId: lead.id,
    messageId: message.id,
    companyName: lead.companyName,
    email: lead.email,
    phone: lead.phone,
    preview: emailResult.data.body,
  });

  return NextResponse.json({ success: true, message });
}
