import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { suggestNewCities } from "@/lib/openai";
import { loadPrompts, clearPromptCache } from "@/lib/openai";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  const envSecret = process.env.CRON_SECRET;
  if (envSecret && secret !== envSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const sector: string = body.sector || "";
  const autoCreate: boolean = body.autoCreate === true;
  const forceCreate: boolean = body.forceCreate === true;

  if (!sector) {
    return NextResponse.json({ error: "sector is required" }, { status: 400 });
  }

  // Load city history for this sector
  const cityLogs = await prisma.cityLog.findMany({
    where: { sector },
    orderBy: { scrapedAt: "desc" },
  });

  const alreadyWorked = cityLogs.map((c) => ({
    city: c.city,
    region: c.region,
    leadsFound: c.leadsFound,
  }));

  await loadPrompts();
  let suggestions;
  let tokensUsed = 0;
  try {
    const result = await suggestNewCities({ sector, alreadyWorkedCities: alreadyWorked });
    suggestions = result.data;
    tokensUsed = result.tokensUsed;

    await prisma.activityLog.create({
      data: {
        type: "ai_city_suggestion",
        message: `🗺️ AI ha suggerito ${suggestions.length} nuove città per settore "${sector}"`,
        metadata: JSON.stringify({ tokensUsed, sector }),
      },
    });
  } finally {
    clearPromptCache();
  }

  // Optionally auto-create campaigns for high-priority suggestions
  const created: { campaignId: number; city: string }[] = [];
  let autoCreateSkipped: string | null = null;
  if (autoCreate && suggestions) {
    const activeCampaign = await prisma.campaign.findFirst({
      where: { sector, status: "active" },
      orderBy: { createdAt: "desc" },
    });

    if (activeCampaign && !forceCreate) {
      autoCreateSkipped = `Esiste gia una campagna attiva per "${sector}": ${activeCampaign.name}`;
    } else {
      const preferred = suggestions.find((s) => s.priority === "alta") || suggestions[0];
      if (preferred) {
        const existing = await prisma.campaign.findFirst({
          where: { sector, city: preferred.city, status: "active" },
        });

        if (existing) {
          autoCreateSkipped = `La campagna per ${preferred.city} esiste gia ed e attiva.`;
        } else {
          const campaign = await prisma.campaign.create({
            data: {
              name: `${sector} – ${preferred.city} (AI)`,
              sector,
              city: preferred.city,
              region: preferred.region,
              status: "active",
            },
          });
          created.push({ campaignId: campaign.id, city: preferred.city });

          await prisma.activityLog.create({
            data: {
              campaignId: campaign.id,
              type: "ai_campaign_created",
              message: `🚀 Campagna creata automaticamente per ${sector} a ${preferred.city}`,
              metadata: JSON.stringify({ source: "suggest-cities", tokensUsed, priority: preferred.priority }),
            },
          });
        }
      } else {
        autoCreateSkipped = "Nessun suggerimento disponibile per creare una nuova campagna.";
      }
    }
  }

  return NextResponse.json({ suggestions, created, autoCreateSkipped, tokensUsed });
}

export const GET = POST; // allows cron services that send GET
