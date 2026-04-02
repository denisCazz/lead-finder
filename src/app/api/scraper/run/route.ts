import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scrapeGoogleMaps } from "@/lib/scrapers/google-maps";
import { scrapePagineGialle } from "@/lib/scrapers/pagine-gialle";
import { extractDomain } from "@/lib/utils";

async function log(campaignId: number, type: string, message: string, progress?: number, metadata?: Record<string, unknown>) {
  await prisma.activityLog.create({
    data: {
      campaignId,
      type,
      message,
      progress: progress ?? null,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { campaignId } = body;

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId required" }, { status: 400 });
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const query = `${campaign.sector} ${campaign.city || campaign.region || "Italia"}`;

  // 0% - Start
  await log(campaignId, "scrape_start", `Scraping avviato per "${query}"`, 0);

  let allLeads: Array<{
    companyName: string;
    contactName?: string;
    phone?: string;
    website?: string;
    address?: string;
    city?: string;
    rating?: number;
    source: string;
  }> = [];

  // 10% - Google Maps
  await log(campaignId, "scrape_progress", "Ricerca su Google Maps...", 10);
  const [googleResults, pgResults] = await Promise.allSettled([
    scrapeGoogleMaps(query, 20),
    scrapePagineGialle(campaign.sector, campaign.city || campaign.region || "Italia", 3),
  ]);

  if (googleResults.status === "fulfilled") {
    allLeads.push(...googleResults.value);
    await log(campaignId, "scrape_progress", `Google Maps: ${googleResults.value.length} risultati trovati`, 40, { source: "google_maps", count: googleResults.value.length });
  } else {
    await log(campaignId, "scrape_error", `Errore Google Maps: ${googleResults.reason?.message || "sconosciuto"}`, 40, { source: "google_maps", error: String(googleResults.reason) });
  }

  // 50% - Pagine Gialle
  if (pgResults.status === "fulfilled") {
    allLeads.push(...pgResults.value);
    await log(campaignId, "scrape_progress", `Pagine Gialle: ${pgResults.value.length} risultati trovati`, 50, { source: "pagine_gialle", count: pgResults.value.length });
  } else {
    await log(campaignId, "scrape_error", `Errore Pagine Gialle: ${pgResults.reason?.message || "sconosciuto"}`, 50, { source: "pagine_gialle", error: String(pgResults.reason) });
  }

  // 60% - Dedup
  await log(campaignId, "scrape_progress", `Deduplicazione di ${allLeads.length} lead...`, 60);
  const seen = new Set<string>();
  const uniqueLeads = allLeads.filter((lead) => {
    const domain = lead.website ? extractDomain(lead.website) : null;
    const key = domain || lead.companyName.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  await log(campaignId, "scrape_progress", `${uniqueLeads.length} lead unici dopo dedup (rimossi ${allLeads.length - uniqueLeads.length} duplicati)`, 70);

  // 70-95% - Save to DB
  let imported = 0;
  let errors = 0;
  for (let i = 0; i < uniqueLeads.length; i++) {
    const lead = uniqueLeads[i];
    try {
      await prisma.lead.upsert({
        where: { website: lead.website || `__none_${Date.now()}_${Math.random()}` },
        update: {},
        create: {
          companyName: lead.companyName,
          contactName: lead.contactName || null,
          phone: lead.phone || null,
          website: lead.website || null,
          address: lead.address || null,
          city: lead.city || campaign.city || null,
          region: campaign.region || null,
          sector: campaign.sector,
          source: lead.source,
          rating: lead.rating || null,
          campaignId: campaign.id,
        },
      });
      imported++;
    } catch (err) {
      errors++;
      console.error("Error saving lead:", err);
    }

    // Log progress every 5 leads or at the end
    if ((i + 1) % 5 === 0 || i === uniqueLeads.length - 1) {
      const pct = 70 + Math.round(((i + 1) / uniqueLeads.length) * 25);
      await log(campaignId, "scrape_progress", `Salvati ${imported}/${uniqueLeads.length} lead...`, pct);
    }
  }

  // 100% - Done
  await log(campaignId, "scrape_done", `Scraping completato: ${imported} lead importati, ${errors} errori, ${allLeads.length - uniqueLeads.length} duplicati rimossi`, 100, {
    found: allLeads.length,
    unique: uniqueLeads.length,
    imported,
    errors,
  });

  return NextResponse.json({
    success: true,
    found: allLeads.length,
    unique: uniqueLeads.length,
    imported,
    errors,
  });
}
