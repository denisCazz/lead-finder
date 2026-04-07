import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { planCampaignWithAI, diagnoseSiteWithAI, qualifyLeadWithAI, generateColdEmail, mapIssuesToProblemString } from "@/lib/openai";
import { scrapeGoogleMaps } from "@/lib/scrapers/google-maps";
import { scrapePagineGialle } from "@/lib/scrapers/pagine-gialle";
import { analyzePageSpeed } from "@/lib/analyzers/pagespeed";
import { analyzeHtml } from "@/lib/analyzers/html-analyzer";
import { calculateScore } from "@/lib/analyzers/scorer";
import { notifyMessageReady } from "@/lib/telegram";
import { extractDomain } from "@/lib/utils";

async function log(
  campaignId: number,
  type: string,
  message: string,
  progress?: number,
  metadata?: Record<string, unknown>,
  leadId?: number
) {
  await prisma.activityLog.create({
    data: {
      campaignId,
      leadId: leadId ?? null,
      type,
      message,
      progress: progress ?? null,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  });
}

export async function POST(request: NextRequest) {
  const { prompt, autoAnalyze = true, autoGenerate = true, maxLeads = 20 } = await request.json();

  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const stats = { planned: false, scraped: 0, analyzed: 0, diagnosed: 0, qualified: 0, emailsGenerated: 0, totalTokens: 0 };

  // ── STEP 1: AI Plans the campaign ──────────────────────────────────
  const planResult = await planCampaignWithAI(prompt);
  const plan = planResult.data;
  stats.totalTokens += planResult.tokensUsed;

  const campaign = await prisma.campaign.create({
    data: {
      name: plan.campaignName,
      sector: plan.sector,
      city: plan.city || null,
      region: plan.region || null,
    },
  });

  await log(campaign.id, "ai_plan", `🤖 AI ha pianificato: "${plan.campaignName}" — ${plan.reasoning}`, 5, {
    prompt, plan, tokensUsed: planResult.tokensUsed, durationMs: planResult.durationMs,
  });
  stats.planned = true;

  // ── STEP 2: Scrape leads ───────────────────────────────────────────
  const query = `${plan.sector} ${plan.city || plan.region || "Italia"}`;
  await log(campaign.id, "scrape_start", `Scraping avviato per "${query}"`, 10);

  type RawLead = { companyName: string; contactName?: string; phone?: string; website?: string; address?: string; city?: string; rating?: number; source: string };
  let allLeads: RawLead[] = [];

  const [googleResults, pgResults] = await Promise.allSettled([
    scrapeGoogleMaps(query, maxLeads),
    scrapePagineGialle(plan.sector, plan.city || plan.region || "Italia", 3),
  ]);

  if (googleResults.status === "fulfilled") {
    allLeads.push(...googleResults.value);
    await log(campaign.id, "scrape_progress", `Google Maps: ${googleResults.value.length} trovati`, 25, { source: "google_maps", count: googleResults.value.length });
  } else {
    await log(campaign.id, "scrape_error", `Errore Google Maps: ${googleResults.reason?.message || "sconosciuto"}`, 25);
  }

  if (pgResults.status === "fulfilled") {
    allLeads.push(...pgResults.value);
    await log(campaign.id, "scrape_progress", `Pagine Gialle: ${pgResults.value.length} trovati`, 30, { source: "pagine_gialle", count: pgResults.value.length });
  } else {
    await log(campaign.id, "scrape_error", `Errore Pagine Gialle: ${pgResults.reason?.message || "sconosciuto"}`, 30);
  }

  // Dedup
  const seen = new Set<string>();
  const uniqueLeads = allLeads.filter((lead) => {
    const domain = lead.website ? extractDomain(lead.website) : null;
    const key = domain || lead.companyName.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Save to DB
  const savedLeadIds: number[] = [];
  for (const lead of uniqueLeads) {
    try {
      const saved = await prisma.lead.upsert({
        where: { website: lead.website || `__none_${Date.now()}_${Math.random()}` },
        update: {},
        create: {
          companyName: lead.companyName,
          contactName: lead.contactName || null,
          phone: lead.phone || null,
          website: lead.website || null,
          address: lead.address || null,
          city: lead.city || plan.city || null,
          region: plan.region || null,
          sector: plan.sector,
          source: lead.source,
          rating: lead.rating || null,
          campaignId: campaign.id,
        },
      });
      savedLeadIds.push(saved.id);
    } catch {
      // duplicate, skip
    }
  }
  stats.scraped = savedLeadIds.length;
  await log(campaign.id, "scrape_done", `Scraping completato: ${savedLeadIds.length} lead importati`, 35, { imported: savedLeadIds.length });

  if (!autoAnalyze) {
    return NextResponse.json({ success: true, campaignId: campaign.id, plan, stats });
  }

  // ── STEP 3: Analyze + AI Diagnose each lead ─────────────────────────
  await log(campaign.id, "ai_analysis", `Avvio analisi AI su ${savedLeadIds.length} lead...`, 40);

  for (let i = 0; i < savedLeadIds.length; i++) {
    const leadId = savedLeadIds[i];
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || !lead.website) continue;

    const pct = 40 + Math.round(((i + 1) / savedLeadIds.length) * 35);

    try {
      // Technical analysis
      const [pagespeed, htmlAnalysis] = await Promise.allSettled([
        analyzePageSpeed(lead.website),
        analyzeHtml(lead.website),
      ]);
      const psResult = pagespeed.status === "fulfilled" ? pagespeed.value : null;
      const htmlResult = htmlAnalysis.status === "fulfilled" ? htmlAnalysis.value : null;
      const { score, issues, suggestedService } = calculateScore(psResult, htmlResult);

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
          stats.totalTokens += diagResult.tokensUsed;
          stats.diagnosed++;

          await log(campaign.id, "ai_analysis", `🧠 AI diagnosi ${lead.companyName}: score ${aiScore}/100 — ${diagResult.data.whatTheyDo}`, pct, {
            leadId: lead.id, aiScore, confidence: diagResult.data.confidence, tokensUsed: diagResult.tokensUsed, durationMs: diagResult.durationMs,
          }, lead.id);

          // AI Qualification
          try {
            const qualResult = await qualifyLeadWithAI({
              companyName: lead.companyName,
              sector: lead.sector,
              score,
              diagnosis: diagResult.data,
            });
            stats.totalTokens += qualResult.tokensUsed;
            stats.qualified++;

            await log(campaign.id, "ai_qualify", `📊 Qualifica ${lead.companyName}: ${qualResult.data.priority} — ${qualResult.data.reason}`, pct, {
              leadId: lead.id, qualification: qualResult.data, tokensUsed: qualResult.tokensUsed,
            }, lead.id);
          } catch (qualErr) {
            await log(campaign.id, "ai_error", `Errore qualifica AI per ${lead.companyName}: ${qualErr instanceof Error ? qualErr.message : "sconosciuto"}`, pct, undefined, lead.id);
          }
        } catch (diagErr) {
          await log(campaign.id, "ai_error", `Errore diagnosi AI per ${lead.companyName}: ${diagErr instanceof Error ? diagErr.message : "sconosciuto"}`, pct, undefined, lead.id);
        }
      }

      // Save analysis
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

      // Blend AI score with technical score (weighted average)
      const finalScore = aiScore !== null ? Math.round(score * 0.4 + aiScore * 0.6) : score;
      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: "analyzed", score: finalScore },
      });
      stats.analyzed++;
    } catch (err) {
      await log(campaign.id, "scrape_error", `Errore analisi ${lead.companyName}: ${err instanceof Error ? err.message : "sconosciuto"}`, pct, undefined, lead.id);
    }
  }

  await log(campaign.id, "ai_analysis", `✅ Analisi completata: ${stats.analyzed} analizzati, ${stats.diagnosed} diagnosi AI`, 80);

  if (!autoGenerate) {
    return NextResponse.json({ success: true, campaignId: campaign.id, plan, stats });
  }

  // ── STEP 4: Auto-generate emails for top leads ──────────────────────
  await log(campaign.id, "ai_generate", `Generazione email AI per i migliori lead...`, 85);

  const topLeads = await prisma.lead.findMany({
    where: { campaignId: campaign.id, status: "analyzed", score: { gte: 30 } },
    include: { analyses: { orderBy: { analyzedAt: "desc" }, take: 1 } },
    orderBy: { score: "desc" },
    take: 15,
  });

  for (let i = 0; i < topLeads.length; i++) {
    const lead = topLeads[i];
    const analysis = lead.analyses[0];
    if (!analysis) continue;

    const pct = 85 + Math.round(((i + 1) / topLeads.length) * 12);

    try {
      let aiDiag = null;
      if (analysis.aiDiagnosis) {
        try { aiDiag = JSON.parse(analysis.aiDiagnosis); } catch { /* ignore */ }
      }

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

      const emailResult = await generateColdEmail({
        companyName: lead.companyName,
        contactName: lead.contactName,
        sector: lead.sector,
        problem: mapped.problem,
        suggestedService: analysis.suggestedService || mapped.service,
        aiDiagnosis: aiDiag,
      });
      stats.totalTokens += emailResult.tokensUsed;

      const message = await prisma.message.create({
        data: {
          leadId: lead.id,
          type: "email",
          subject: emailResult.data.subject,
          content: emailResult.data.body,
          status: "draft",
        },
      });
      stats.emailsGenerated++;

      await log(campaign.id, "ai_generate", `✉️ Email generata per ${lead.companyName} (${emailResult.tokensUsed} tokens)`, pct, {
        leadId: lead.id, messageId: message.id, tokensUsed: emailResult.tokensUsed, durationMs: emailResult.durationMs,
      }, lead.id);

      // Telegram notification
      try {
        await notifyMessageReady({
          leadId: lead.id,
          messageId: message.id,
          companyName: lead.companyName,
          email: lead.email,
          phone: lead.phone,
          preview: emailResult.data.body,
        });
      } catch { /* telegram optional */ }
    } catch (err) {
      await log(campaign.id, "ai_error", `Errore generazione email ${lead.companyName}: ${err instanceof Error ? err.message : "sconosciuto"}`, pct, undefined, lead.id);
    }
  }

  // ── DONE ─────────────────────────────────────────────────────────────
  await log(campaign.id, "ai_done", `🎯 Pipeline AI completata! ${stats.scraped} lead trovati → ${stats.analyzed} analizzati → ${stats.diagnosed} diagnosi AI → ${stats.emailsGenerated} email generate. Token totali: ${stats.totalTokens}`, 100, { stats });

  return NextResponse.json({ success: true, campaignId: campaign.id, plan, stats });
}
