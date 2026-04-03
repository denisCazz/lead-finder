import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scrapeGoogleMaps } from "@/lib/scrapers/google-maps";
import { scrapePagineGialle } from "@/lib/scrapers/pagine-gialle";
import { analyzePageSpeed } from "@/lib/analyzers/pagespeed";
import { analyzeHtml } from "@/lib/analyzers/html-analyzer";
import { calculateScore } from "@/lib/analyzers/scorer";
import {
  diagnoseSiteWithAI,
  qualifyLeadWithAI,
  generateColdEmail,
  generateWhatsAppMessage,
  mapIssuesToProblemString,
  loadPrompts,
  clearPromptCache,
  SiteDiagnosis,
} from "@/lib/openai";
import { notifyNewLead, notifyDailySummary } from "@/lib/telegram";
import { extractDomain } from "@/lib/utils";

/**
 * NIGHT CRON — runs at ~02:00
 * 1. Scrape leads for all active campaigns → write CityLog
 * 2. Analyze only leads that have NO existing Analysis (avoid re-analysis)
 * 3. Generate email draft + WhatsApp text for each analyzed lead
 * NO emails are sent here — sending is delegated to the morning cron.
 */
async function handler(request: NextRequest) {
  // Auth check — skip if no CRON_SECRET configured
  const secret = request.headers.get("x-cron-secret");
  const envSecret = process.env.CRON_SECRET;
  const mask = (s: string | null | undefined) =>
    s ? `${s.slice(0, 3)}***${s.slice(-2)} (len=${s.length})` : "(not set)";
  console.log(`[cron/daily] method=${request.method}`);
  console.log(`[cron/daily] x-cron-secret received: ${mask(secret)}`);
  console.log(`[cron/daily] CRON_SECRET env:         ${mask(envSecret)}`);
  if (envSecret && secret !== envSecret) {
    console.error(`[cron/daily] AUTH FAILED — header=${mask(secret)} env=${mask(envSecret)}`);
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

  // Pre-load custom prompts
  await loadPrompts();

  const results = {
    scraped: 0,
    analyzed: 0,
    diagnosed: 0,
    generated: 0,
    totalTokens: 0,
    errors: [] as string[],
  };

  // 1. Get all active campaigns and scrape
  const campaigns = await prisma.campaign.findMany({ where: { status: "active" } });

  for (const campaign of campaigns) {
    try {
      const cityLabel = campaign.city || campaign.region || "Italia";
      const query = `${campaign.sector} ${cityLabel}`;

      await prisma.activityLog.create({
        data: { campaignId: campaign.id, type: "scrape_start", message: `🌙 Cron notturno: scraping "${query}"` },
      });

      const [gmLeads, pgLeads] = await Promise.allSettled([
        scrapeGoogleMaps(query, 10),
        scrapePagineGialle(campaign.sector, cityLabel, 10),
      ]);

      const allLeads = [
        ...(gmLeads.status === "fulfilled" ? gmLeads.value : []),
        ...(pgLeads.status === "fulfilled" ? pgLeads.value : []),
      ];

      let newForCampaign = 0;
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

        const created = await prisma.lead.create({
          data: {
            companyName: lead.companyName,
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
        results.scraped++;
        newForCampaign++;
        try {
          await notifyNewLead({
            id: created.id,
            companyName: created.companyName,
            sector: created.sector,
            city: created.city,
            website: created.website,
            score: created.score,
          });
        } catch { /* telegram optional */ }
      }

      // Write CityLog for tracking
      if (campaign.city || campaign.region) {
        await prisma.cityLog.create({
          data: {
            city: campaign.city || campaign.region || "Italia",
            region: campaign.region,
            sector: campaign.sector,
            campaignId: campaign.id,
            leadsFound: newForCampaign,
          },
        });
      }

      await prisma.activityLog.create({
        data: { campaignId: campaign.id, type: "scrape_done", message: `✅ Scraping completato: ${newForCampaign} nuovi lead per "${query}"` },
      });
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      results.errors.push(`Scrape ${campaign.name}: ${errMsg}`);
    }
  }

  // 2. Analyze leads that have NO analysis yet (never re-analyze)
  const newLeads = await prisma.lead.findMany({
    where: { website: { not: null }, analyses: { none: {} } },
    take: 20,
  });

  for (const lead of newLeads) {
    try {
      if (!lead.website) continue;
      const fullUrl = lead.website.startsWith("http") ? lead.website : `https://${lead.website}`;

      const [pageSpeed, htmlResult] = await Promise.allSettled([
        analyzePageSpeed(fullUrl),
        analyzeHtml(fullUrl),
      ]);

      const ps = pageSpeed.status === "fulfilled" ? pageSpeed.value : null;
      const html = htmlResult.status === "fulfilled" ? htmlResult.value : null;
      const scoreResult = calculateScore(ps, html);

      // AI Diagnosis
      let aiDiagnosisJson: string | null = null;
      let aiScore: number | null = null;
      let aiTokens = 0;
      let diagnosis: SiteDiagnosis | null = null;

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
            hasAnalytics: html.hasAnalytics,
            hasSocialPresence: html.hasSocialPresence,
            hasWhatsappWidget: html.hasWhatsappWidget,
            hasContactForm: html.hasContactForm,
            detectedTechs: html.detectedTechs,
          });

          aiDiagnosisJson = JSON.stringify(diagResult.data);
          aiScore = diagResult.data.aiScore;
          diagnosis = diagResult.data;
          aiTokens = diagResult.tokensUsed;
          results.totalTokens += diagResult.tokensUsed;
          results.diagnosed++;

          await prisma.activityLog.create({
            data: {
              leadId: lead.id, campaignId: lead.campaignId,
              type: "ai_analysis",
              message: `🧠 Diagnosi AI ${lead.companyName}: score ${aiScore}/100`,
              metadata: JSON.stringify({ tokensUsed: diagResult.tokensUsed, durationMs: diagResult.durationMs, confidence: diagResult.data.confidence }),
            },
          });

          // AI Qualification
          try {
            const qualResult = await qualifyLeadWithAI({
              companyName: lead.companyName, sector: lead.sector,
              score: scoreResult.score, diagnosis: diagResult.data,
            });
            aiTokens += qualResult.tokensUsed;
            results.totalTokens += qualResult.tokensUsed;
          } catch { /* optional */ }
        } catch { /* AI failed, continue with technical */ }
      }

      await prisma.analysis.create({
        data: {
          leadId: lead.id,
          performanceScore: ps?.performanceScore || null,
          lcp: ps?.lcp || null,
          fid: ps?.fid || null,
          cls: ps?.cls || null,
          isMobileFriendly: html?.isMobileFriendly || false,
          hasEcommerce: html?.hasEcommerce || false,
          hasBooking: html?.hasBooking || false,
          hasCrm: html?.hasCrm || false,
          hasModernDesign: html?.hasModernDesign || false,
          issuesJson: JSON.stringify(scoreResult.issues),
          suggestedService: scoreResult.suggestedService,
          aiDiagnosis: aiDiagnosisJson,
          aiScore,
          aiTokensUsed: aiTokens,
        },
      });

      const finalScore = aiScore !== null ? Math.round(scoreResult.score * 0.4 + aiScore * 0.6) : scoreResult.score;
      await prisma.lead.update({
        where: { id: lead.id },
        data: { score: finalScore, status: "analyzed" },
      });

      results.analyzed++;
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      results.errors.push(`Analyze ${lead.companyName}: ${errMsg}`);
    }
  }

  // 3. Generate drafts (email + WhatsApp) for analyzed leads without messages
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

      const { problem, service } = mapIssuesToProblemString({
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
        problem,
        suggestedService: analysis.suggestedService || service,
        aiDiagnosis: aiDiag,
      });
      results.totalTokens += emailResult.tokensUsed;

      // Generate WhatsApp text
      let whatsappText: string | null = null;
      try {
        const waResult = await generateWhatsAppMessage({
          companyName: lead.companyName,
          sector: lead.sector,
          problem,
          suggestedService: analysis.suggestedService || service,
          personalizedHook: aiDiag?.personalizedHook ?? null,
        });
        whatsappText = waResult.data;
        results.totalTokens += waResult.tokensUsed;
      } catch { /* optional */ }

      const messageType = lead.email ? "email" : lead.phone ? "whatsapp" : "email";
      const message = await prisma.message.create({
        data: {
          leadId: lead.id,
          type: messageType,
          subject: emailResult.data.subject,
          content: emailResult.data.body,
          whatsappContent: whatsappText,
          status: "draft",
        },
      });

      await prisma.activityLog.create({
        data: {
          leadId: lead.id, campaignId: lead.campaignId,
          type: "ai_generate",
          message: `✉️ Testi generati per ${lead.companyName} (${emailResult.tokensUsed} tokens)`,
          metadata: JSON.stringify({ messageId: message.id, tokensUsed: emailResult.tokensUsed }),
        },
      });

      results.generated++;
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      results.errors.push(`Generate ${lead.companyName}: ${errMsg}`);
    }
  }

  // 4. Send daily summary
  try {
    await notifyDailySummary({
      newLeads: results.scraped,
      analyzed: results.analyzed,
      messagesGenerated: results.generated,
      messagesSent: 0,
    });
  } catch { /* telegram optional */ }

  clearPromptCache();
  return NextResponse.json(results);
}

export const POST = handler;
export const GET = handler; // allows cron services that send GET
