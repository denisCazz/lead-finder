import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scrapeGoogleMaps } from "@/lib/scrapers/google-maps";
import { scrapePagineGialle } from "@/lib/scrapers/pagine-gialle";
import { extractDomain } from "@/lib/utils";

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

  // Run scrapers in parallel
  const [googleResults, pgResults] = await Promise.allSettled([
    scrapeGoogleMaps(query, 20),
    scrapePagineGialle(campaign.sector, campaign.city || campaign.region || "Italia", 3),
  ]);

  if (googleResults.status === "fulfilled") allLeads.push(...googleResults.value);
  if (pgResults.status === "fulfilled") allLeads.push(...pgResults.value);

  // Deduplicate by domain
  const seen = new Set<string>();
  const uniqueLeads = allLeads.filter((lead) => {
    const domain = lead.website ? extractDomain(lead.website) : null;
    const key = domain || lead.companyName.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Save to database
  let imported = 0;
  for (const lead of uniqueLeads) {
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
      // Duplicate, skip
      console.error("Error saving lead:", err);
    }
  }

  return NextResponse.json({
    success: true,
    found: allLeads.length,
    unique: uniqueLeads.length,
    imported,
  });
}
