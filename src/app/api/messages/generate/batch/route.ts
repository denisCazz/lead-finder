import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateColdEmail, mapIssuesToProblemString } from "@/lib/openai";
import { notifyMessageReady } from "@/lib/telegram";

export async function POST() {
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

      const { subject, body } = await generateColdEmail({
        companyName: lead.companyName,
        contactName: lead.contactName,
        sector: lead.sector,
        problem,
        suggestedService: service,
      });

      const message = await prisma.message.create({
        data: {
          leadId: lead.id,
          type: "email",
          subject,
          content: body,
          status: "draft",
        },
      });

      await notifyMessageReady({
        leadId: lead.id,
        messageId: message.id,
        companyName: lead.companyName,
        email: lead.email,
        phone: lead.phone,
        preview: body,
      });

      results.push({ leadId: lead.id, messageId: message.id });
    } catch (err) {
      console.error(`Error generating message for lead ${lead.id}:`, err);
    }
  }

  return NextResponse.json({ success: true, generated: results.length, results });
}
