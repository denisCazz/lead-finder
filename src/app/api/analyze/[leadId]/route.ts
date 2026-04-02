import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzePageSpeed } from "@/lib/analyzers/pagespeed";
import { analyzeHtml } from "@/lib/analyzers/html-analyzer";
import { calculateScore } from "@/lib/analyzers/scorer";
import { diagnoseSiteWithAI, qualifyLeadWithAI } from "@/lib/openai";

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

  // AI Diagnosis
  let aiDiagnosisJson: string | null = null;
  let aiScore: number | null = null;
  let aiTokens = 0;
  let diagnosisData = null;

  if (htmlResult?.extractedText) {
    try {
      const diagResult = await diagnoseSiteWithAI({
        companyName: lead.companyName,
        sector: lead.sector,
        website: lead.website,
        pageTitle: htmlResult.pageTitle,
        metaDescription: htmlResult.metaDescription,
        extractedText: htmlResult.extractedText,
        performanceScore: psResult?.performanceScore ?? null,
        hasEcommerce: htmlResult.hasEcommerce,
        hasBooking: htmlResult.hasBooking,
        isMobileFriendly: htmlResult.isMobileFriendly,
        hasModernDesign: htmlResult.hasModernDesign,
        hasCrm: htmlResult.hasCrm,
        detectedTechs: htmlResult.detectedTechs,
      });

      diagnosisData = diagResult.data;
      aiDiagnosisJson = JSON.stringify(diagnosisData);
      aiScore = diagnosisData.aiScore;
      aiTokens = diagResult.tokensUsed;

      // Log AI diagnosis
      await prisma.activityLog.create({
        data: {
          leadId: lead.id,
          campaignId: lead.campaignId,
          type: "ai_analysis",
          message: `🧠 Diagnosi AI per ${lead.companyName}: score ${aiScore}/100 — ${diagnosisData.whatTheyDo}`,
          metadata: JSON.stringify({
            tokensUsed: diagResult.tokensUsed,
            model: diagResult.model,
            durationMs: diagResult.durationMs,
            confidence: diagnosisData.confidence,
          }),
        },
      });

      // AI Qualification
      try {
        const qualResult = await qualifyLeadWithAI({
          companyName: lead.companyName,
          sector: lead.sector,
          score,
          diagnosis: diagnosisData,
        });
        aiTokens += qualResult.tokensUsed;

        await prisma.activityLog.create({
          data: {
            leadId: lead.id,
            campaignId: lead.campaignId,
            type: "ai_qualify",
            message: `📊 Qualifica AI ${lead.companyName}: ${qualResult.data.priority} — ${qualResult.data.reason} (canale: ${qualResult.data.suggestedChannel})`,
            metadata: JSON.stringify({
              qualification: qualResult.data,
              tokensUsed: qualResult.tokensUsed,
              durationMs: qualResult.durationMs,
            }),
          },
        });
      } catch {
        // qualification is optional, continue
      }
    } catch {
      // AI diagnosis failed, continue with technical analysis only
    }
  }

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
      aiDiagnosis: aiDiagnosisJson,
      aiScore,
      aiTokensUsed: aiTokens,
    },
  });

  // Blend scores: weighted average if AI score is available
  const finalScore = aiScore !== null ? Math.round(score * 0.4 + aiScore * 0.6) : score;

  // Update lead status and score
  await prisma.lead.update({
    where: { id: lead.id },
    data: { status: "analyzed", score: finalScore },
  });

  return NextResponse.json({
    success: true,
    analysis,
    score: finalScore,
    issues,
    suggestedService,
    aiDiagnosis: diagnosisData,
    aiTokensUsed: aiTokens,
  });
}
