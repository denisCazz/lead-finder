import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scrapeGoogleMaps } from "@/lib/scrapers/google-maps";
import { scrapePagineGialle } from "@/lib/scrapers/pagine-gialle";
import { analyzePageSpeed } from "@/lib/analyzers/pagespeed";
import { analyzeHtml } from "@/lib/analyzers/html-analyzer";
import { calculateScore } from "@/lib/analyzers/scorer";
import { generateColdEmail, mapIssuesToProblemString } from "@/lib/openai";
import { notifyNewLead, notifyMessageReady, notifyDailySummary } from "@/lib/telegram";
import { extractDomain } from "@/lib/utils";

export async function POST() {
  const results = {
    scraped: 0,
    analyzed: 0,
    generated: 0,
    errors: [] as string[],
  };

  // 1. Get all active campaigns and scrape
  const campaigns = await prisma.campaign.findMany({ where: { status: "active" } });

  for (const campaign of campaigns) {
    try {
      const query = `${campaign.sector} ${campaign.city || campaign.region || "Italia"}`;
      const [gmLeads, pgLeads] = await Promise.allSettled([
        scrapeGoogleMaps(query, 10),
        scrapePagineGialle(campaign.sector, campaign.city || campaign.region || "", 10),
      ]);

      const allLeads = [
        ...(gmLeads.status === "fulfilled" ? gmLeads.value : []),
        ...(pgLeads.status === "fulfilled" ? pgLeads.value : []),
      ];

      for (const lead of allLeads) {
        const domain = lead.website ? extractDomain(lead.website) : null;
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
            city: lead.city || null,
            source: lead.source || "google_maps",
            status: "new",
            campaignId: campaign.id,
          },
        });
        results.scraped++;
        await notifyNewLead({
          id: created.id,
          companyName: created.companyName,
          sector: created.sector,
          city: created.city,
          website: created.website,
          score: created.score,
        });
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      results.errors.push(`Scrape ${campaign.name}: ${errMsg}`);
    }
  }

  // 2. Analyze new leads
  const newLeads = await prisma.lead.findMany({
    where: { status: "new", website: { not: null } },
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
        },
      });

      await prisma.lead.update({
        where: { id: lead.id },
        data: { score: scoreResult.score, status: "analyzed" },
      });

      results.analyzed++;
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      results.errors.push(`Analyze ${lead.companyName}: ${errMsg}`);
    }
  }

  // 3. Generate emails for analyzed leads without messages
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

      const email = await generateColdEmail({
        companyName: lead.companyName,
        contactName: lead.contactName,
        sector: lead.sector,
        problem,
        suggestedService: analysis.suggestedService || service,
      });

      const message = await prisma.message.create({
        data: {
          leadId: lead.id,
          type: lead.email ? "email" : "whatsapp",
          subject: email.subject,
          content: email.body,
          status: "draft",
        },
      });

      await notifyMessageReady({
        leadId: lead.id,
        messageId: message.id,
        companyName: lead.companyName,
        email: lead.email,
        phone: lead.phone,
        preview: email.body,
      });

      results.generated++;
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      results.errors.push(`Generate ${lead.companyName}: ${errMsg}`);
    }
  }

  // 4. Send daily summary
  await notifyDailySummary({
    newLeads: results.scraped,
    analyzed: results.analyzed,
    messagesGenerated: results.generated,
    messagesSent: 0,
  });

  return NextResponse.json(results);
}
