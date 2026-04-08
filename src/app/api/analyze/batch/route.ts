import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzePageSpeed } from "@/lib/analyzers/pagespeed";
import { analyzeHtml } from "@/lib/analyzers/html-analyzer";
import { calculateScore } from "@/lib/analyzers/scorer";
import { diagnoseSiteWithAI, qualifyLeadWithAI, loadPrompts, clearPromptCache } from "@/lib/openai";

export async function POST() {
  // Pre-load prompts from DB once for this batch
  await loadPrompts();

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
      const { score, issues, suggestedService } = calculateScore(psResult, htmlResult, lead.sector);

      // AI Diagnosis
      let aiDiagnosisJson: string | null = null;
      let aiScore: number | null = null;
      let aiTokens = 0;

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

          aiDiagnosisJson = JSON.stringify(diagResult.data);
          aiScore = diagResult.data.aiScore;
          aiTokens = diagResult.tokensUsed;

          await prisma.activityLog.create({
            data: {
              leadId: lead.id,
              campaignId: lead.campaignId,
              type: "ai_analysis",
              message: `🧠 Diagnosi AI per ${lead.companyName}: score ${aiScore}/100 — ${diagResult.data.whatTheyDo}`,
              metadata: JSON.stringify({
                tokensUsed: diagResult.tokensUsed,
                model: diagResult.model,
                durationMs: diagResult.durationMs,
                confidence: diagResult.data.confidence,
              }),
            },
          });

          // AI Qualification
          try {
            const qualResult = await qualifyLeadWithAI({
              companyName: lead.companyName,
              sector: lead.sector,
              score,
              diagnosis: diagResult.data,
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
            // qualification is optional
          }
        } catch {
          // AI diagnosis failed, continue with technical only
        }
      }

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
          aiDiagnosis: aiDiagnosisJson,
          aiScore,
          aiTokensUsed: aiTokens,
        },
      });

      const finalScore = aiScore !== null ? Math.round(score * 0.4 + aiScore * 0.6) : score;

      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: "analyzed", score: finalScore },
      });

      results.push({ leadId: lead.id, score: finalScore, aiScore, suggestedService });
    } catch (err) {
      console.error(`Error analyzing lead ${lead.id}:`, err);
    }
  }

  clearPromptCache();
  return NextResponse.json({ success: true, analyzed: results.length, results });
}
