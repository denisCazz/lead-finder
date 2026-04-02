import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scrapeGoogleMaps } from "@/lib/scrapers/google-maps";
import { scrapePagineGialle } from "@/lib/scrapers/pagine-gialle";
import { analyzePageSpeed } from "@/lib/analyzers/pagespeed";
import { analyzeHtml } from "@/lib/analyzers/html-analyzer";
import { calculateScore } from "@/lib/analyzers/scorer";
import { diagnoseSiteWithAI, qualifyLeadWithAI, generateColdEmail, mapIssuesToProblemString, loadPrompts, clearPromptCache, SiteDiagnosis } from "@/lib/openai";
import { notifyMessageReady, sendTelegramMessage } from "@/lib/telegram";
import { extractDomain } from "@/lib/utils";

async function log(campaignId: number | null, type: string, message: string, leadId?: number, metadata?: Record<string, unknown>) {
  await prisma.activityLog.create({
    data: {
      campaignId, leadId: leadId ?? null,
      type, message,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  });
}

export async function POST(request: NextRequest) {
  // ── Auth check ──────────────────────────────────────────────────────
  const secret = request.headers.get("x-cron-secret");
  const envSecret = process.env.CRON_SECRET;
  if (envSecret && secret !== envSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Check if cron is enabled (optional setting)
  try {
    const enabledSetting = await prisma.setting.findUnique({ where: { key: "cron_enabled" } });
    if (enabledSetting && enabledSetting.value === "false") {
      return NextResponse.json({ error: "Cron is disabled", skipped: true });
    }
  } catch { /* DB issue — continue anyway */ }

  // Pre-load custom prompts from DB
  await loadPrompts();

  const startTime = Date.now();
  const stats = {
    scraped: 0,
    analyzed: 0,
    diagnosed: 0,
    generated: 0,
    totalTokens: 0,
    errors: [] as string[],
  };

  // ── STEP 1: Scrape new leads for all active campaigns ──────────────
  const campaigns = await prisma.campaign.findMany({ where: { status: "active" } });

  for (const campaign of campaigns) {
    try {
      const query = `${campaign.sector} ${campaign.city || campaign.region || "Italia"}`;
      await log(campaign.id, "scrape_start", `⏰ Cron orario: scraping "${query}"`);

      const [gmLeads, pgLeads] = await Promise.allSettled([
        scrapeGoogleMaps(query, 10),
        scrapePagineGialle(campaign.sector, campaign.city || campaign.region || "", 2),
      ]);

      const allLeads = [
        ...(gmLeads.status === "fulfilled" ? gmLeads.value : []),
        ...(pgLeads.status === "fulfilled" ? pgLeads.value : []),
      ];

      // Dedup by domain
      const seen = new Set<string>();
      for (const lead of allLeads) {
        const domain = lead.website ? extractDomain(lead.website) : null;
        const dedup = domain || lead.companyName.toLowerCase();
        if (seen.has(dedup)) continue;
        seen.add(dedup);

        if (domain) {
          const exists = await prisma.lead.findFirst({ where: { website: domain } });
          if (exists) continue;
        }

        try {
          await prisma.lead.create({
            data: {
              companyName: lead.companyName,
              contactName: "contactName" in lead ? (lead.contactName as string) || null : null,
              website: domain,
              phone: lead.phone || null,
              address: lead.address || null,
              city: lead.city || campaign.city || null,
              region: campaign.region || null,
              sector: campaign.sector,
              source: lead.source || "google_maps",
              status: "new",
              campaignId: campaign.id,
            },
          });
          stats.scraped++;
        } catch { /* duplicate, skip */ }
      }

      await log(campaign.id, "scrape_done", `✅ Scraping completato: ${stats.scraped} nuovi lead trovati`);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      stats.errors.push(`Scrape ${campaign.name}: ${errMsg}`);
      await log(campaign.id, "scrape_error", `❌ Errore scraping ${campaign.name}: ${errMsg}`);
    }
  }

  // ── STEP 2: Analyze new leads with AI ──────────────────────────────
  const newLeads = await prisma.lead.findMany({
    where: { status: "new", website: { not: null } },
    take: 15,
  });

  for (const lead of newLeads) {
    if (!lead.website) continue;

    try {
      const fullUrl = lead.website.startsWith("http") ? lead.website : `https://${lead.website}`;

      const [pageSpeed, htmlAnalysis] = await Promise.allSettled([
        analyzePageSpeed(fullUrl),
        analyzeHtml(fullUrl),
      ]);

      const ps = pageSpeed.status === "fulfilled" ? pageSpeed.value : null;
      const html = htmlAnalysis.status === "fulfilled" ? htmlAnalysis.value : null;
      const { score, issues, suggestedService } = calculateScore(ps, html);

      // AI Diagnosis
      let aiDiagnosisJson: string | null = null;
      let aiScore: number | null = null;
      let aiTokens = 0;

      if (html?.extractedText) {
        try {
          const diagResult = await diagnoseSiteWithAI({
            companyName: lead.companyName,
            sector: lead.sector,
            website: lead.website,
            pageTitle: html.pageTitle,
            metaDescription: html.metaDescription,
            extractedText: html.extractedText,
            performanceScore: ps?.performanceScore ?? null,
            hasEcommerce: html.hasEcommerce,
            hasBooking: html.hasBooking,
            isMobileFriendly: html.isMobileFriendly,
            hasModernDesign: html.hasModernDesign,
            hasCrm: html.hasCrm,
            detectedTechs: html.detectedTechs,
          });

          aiDiagnosisJson = JSON.stringify(diagResult.data);
          aiScore = diagResult.data.aiScore;
          aiTokens = diagResult.tokensUsed;
          stats.totalTokens += diagResult.tokensUsed;
          stats.diagnosed++;

          await log(lead.campaignId, "ai_analysis", `🧠 AI: ${lead.companyName} — score ${aiScore}/100, ${diagResult.data.confidence}`, lead.id, {
            tokensUsed: diagResult.tokensUsed, durationMs: diagResult.durationMs,
          });

          // Qualification
          try {
            const qualResult = await qualifyLeadWithAI({
              companyName: lead.companyName,
              sector: lead.sector,
              score,
              diagnosis: diagResult.data,
            });
            aiTokens += qualResult.tokensUsed;
            stats.totalTokens += qualResult.tokensUsed;

            await log(lead.campaignId, "ai_qualify", `📊 ${lead.companyName}: ${qualResult.data.priority} — ${qualResult.data.reason}`, lead.id);
          } catch { /* optional */ }
        } catch { /* AI failed, continue technical */ }
      }

      await prisma.analysis.create({
        data: {
          leadId: lead.id,
          performanceScore: ps?.performanceScore ?? null,
          lcp: ps?.lcp ?? null,
          fid: ps?.fid ?? null,
          cls: ps?.cls ?? null,
          hasEcommerce: html?.hasEcommerce ?? false,
          hasBooking: html?.hasBooking ?? false,
          isMobileFriendly: html?.isMobileFriendly ?? true,
          hasModernDesign: html?.hasModernDesign ?? true,
          hasCrm: html?.hasCrm ?? false,
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

      stats.analyzed++;
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      stats.errors.push(`Analyze ${lead.companyName}: ${errMsg}`);
    }
  }

  // ── STEP 3: Generate emails for analyzed leads without messages ─────
  const analyzedLeads = await prisma.lead.findMany({
    where: {
      status: "analyzed",
      messages: { none: {} },
    },
    include: { analyses: { orderBy: { analyzedAt: "desc" }, take: 1 } },
    take: 10,
  });

  for (const lead of analyzedLeads) {
    try {
      const analysis = lead.analyses[0];
      if (!analysis) continue;

      const mapped = mapIssuesToProblemString({
        performanceScore: analysis.performanceScore,
        hasEcommerce: analysis.hasEcommerce,
        hasBooking: analysis.hasBooking,
        isMobileFriendly: analysis.isMobileFriendly,
        hasModernDesign: analysis.hasModernDesign,
        hasCrm: analysis.hasCrm,
      });

      let aiDiag: SiteDiagnosis | null = null;
      if (analysis.aiDiagnosis) {
        try { aiDiag = JSON.parse(analysis.aiDiagnosis); } catch { /* ignore */ }
      }

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
          type: lead.email ? "email" : "whatsapp",
          subject: emailResult.data.subject,
          content: emailResult.data.body,
          status: "draft",
        },
      });

      await log(lead.campaignId, "ai_generate", `✉️ Email per ${lead.companyName} (${emailResult.tokensUsed} tokens)`, lead.id, {
        messageId: message.id, tokensUsed: emailResult.tokensUsed,
      });

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

      stats.generated++;
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      stats.errors.push(`Generate ${lead.companyName}: ${errMsg}`);
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────
  const durationSec = Math.round((Date.now() - startTime) / 1000);
  const summary = `⏰ <b>Cron Orario Completato</b> (${durationSec}s)

📥 Lead trovati: ${stats.scraped}
🔍 Analizzati: ${stats.analyzed}
🧠 Diagnosi AI: ${stats.diagnosed}
✉️ Email generate: ${stats.generated}
🪙 Token AI usati: ${stats.totalTokens}
${stats.errors.length > 0 ? `\n⚠️ Errori: ${stats.errors.length}` : ""}`;

  try {
    await sendTelegramMessage(summary);
  } catch { /* optional */ }

  clearPromptCache();
  return NextResponse.json({ success: true, durationSec, ...stats });
}

// Also support GET for easy browser/uptime testing
export async function GET(request: NextRequest) {
  return POST(request);
}
