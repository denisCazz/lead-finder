import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzePageSpeed } from "@/lib/analyzers/pagespeed";
import { analyzeHtml } from "@/lib/analyzers/html-analyzer";
import { calculateScore } from "@/lib/analyzers/scorer";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const { leadId } = await params;
  const lead = await prisma.lead.findUnique({ where: { id: parseInt(leadId) } });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  if (!lead.website) {
    return NextResponse.json({ error: "Lead has no website to analyze" }, { status: 400 });
  }

  // Run analyses
  const [pagespeed, htmlAnalysis] = await Promise.allSettled([
    analyzePageSpeed(lead.website),
    analyzeHtml(lead.website),
  ]);

  const psResult = pagespeed.status === "fulfilled" ? pagespeed.value : null;
  const htmlResult = htmlAnalysis.status === "fulfilled" ? htmlAnalysis.value : null;

  // Calculate score
  const { score, issues, suggestedService } = calculateScore(psResult, htmlResult);

  // Save analysis
  const analysis = await prisma.analysis.create({
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

  // Update lead status and score
  await prisma.lead.update({
    where: { id: lead.id },
    data: { status: "analyzed", score },
  });

  return NextResponse.json({ success: true, analysis, score, issues, suggestedService });
}
