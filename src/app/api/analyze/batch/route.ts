import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzePageSpeed } from "@/lib/analyzers/pagespeed";
import { analyzeHtml } from "@/lib/analyzers/html-analyzer";
import { calculateScore } from "@/lib/analyzers/scorer";

export async function POST() {
  const leads = await prisma.lead.findMany({
    where: {
      status: "new",
      website: { not: null },
    },
    take: 10,
  });

  const results = [];

  for (const lead of leads) {
    if (!lead.website) continue;

    try {
      const [pagespeed, htmlAnalysis] = await Promise.allSettled([
        analyzePageSpeed(lead.website),
        analyzeHtml(lead.website),
      ]);

      const psResult = pagespeed.status === "fulfilled" ? pagespeed.value : null;
      const htmlResult = htmlAnalysis.status === "fulfilled" ? htmlAnalysis.value : null;
      const { score, issues, suggestedService } = calculateScore(psResult, htmlResult);

      await prisma.analysis.create({
        data: {
          leadId: lead.id,
          performanceScore: psResult?.performanceScore ?? null,
          lcp: psResult?.lcp ?? null,
          fid: psResult?.fid ?? null,
          cls: psResult?.cls ?? null,
          hasEcommerce: htmlResult?.hasEcommerce ?? false,
          hasBooking: htmlResult?.hasBooking ?? false,
          isMobileFriendly: htmlResult?.isMobileFriendly ?? true,
          hasModernDesign: htmlResult?.hasModernDesign ?? true,
          hasCrm: htmlResult?.hasCrm ?? false,
          issuesJson: JSON.stringify(issues),
          suggestedService,
        },
      });

      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: "analyzed", score },
      });

      results.push({ leadId: lead.id, score, suggestedService });
    } catch (err) {
      console.error(`Error analyzing lead ${lead.id}:`, err);
    }
  }

  return NextResponse.json({ success: true, analyzed: results.length, results });
}
