import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateColdEmail, mapIssuesToProblemString, loadPrompts, clearPromptCache, SiteDiagnosis } from "@/lib/openai";
import { notifyMessageReady } from "@/lib/telegram";

export async function POST() {
  await loadPrompts();

  const leads = await prisma.lead.findMany({
    where: {
      status: "analyzed",
      messages: { none: {} },
    },
    include: { analyses: { orderBy: { analyzedAt: "desc" }, take: 1 } },
    take: 10,
  });

  const results = [];

  for (const lead of leads) {
    try {
      const analysis = lead.analyses[0];
      let problem: string;
      let service: string;

      // Parse AI diagnosis if available
      let aiDiag: SiteDiagnosis | null = null;
      if (analysis?.aiDiagnosis) {
        try { aiDiag = JSON.parse(analysis.aiDiagnosis); } catch { /* ignore */ }
      }

      if (analysis) {
        const mapped = mapIssuesToProblemString({
          performanceScore: analysis.performanceScore,
          hasEcommerce: analysis.hasEcommerce,
          hasBooking: analysis.hasBooking,
          isMobileFriendly: analysis.isMobileFriendly,
          hasModernDesign: analysis.hasModernDesign,
          hasCrm: analysis.hasCrm,
          sector: lead.sector,
          aiDiagnosis: aiDiag,
        });
        problem = mapped.problem;
        service = analysis.suggestedService || mapped.service;
      } else {
        problem = "Il sito ha margini di miglioramento significativi";
        service = "Strategia digitale e ottimizzazione della presenza online";
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
          type: lead.email ? "email" : "whatsapp",
          subject: emailResult.data.subject,
          content: emailResult.data.body,
          status: "draft",
        },
      });

      // Log AI email generation
      await prisma.activityLog.create({
        data: {
          leadId: lead.id,
          campaignId: lead.campaignId,
          type: "ai_generate",
          message: `✉️ Email generata per ${lead.companyName} (${emailResult.tokensUsed} tokens)`,
          metadata: JSON.stringify({
            messageId: message.id,
            tokensUsed: emailResult.tokensUsed,
            model: emailResult.model,
            durationMs: emailResult.durationMs,
          }),
        },
      });

      await notifyMessageReady({
        leadId: lead.id,
        messageId: message.id,
        companyName: lead.companyName,
        email: lead.email,
        phone: lead.phone,
        preview: emailResult.data.body,
      });

      results.push({ leadId: lead.id, messageId: message.id });
    } catch (err) {
      console.error(`Error generating message for lead ${lead.id}:`, err);
    }
  }

  clearPromptCache();
  return NextResponse.json({ success: true, generated: results.length, results });
}
