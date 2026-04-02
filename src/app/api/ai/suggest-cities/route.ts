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
  if (autoCreate && suggestions) {
    for (const s of suggestions.filter((s) => s.priority === "alta")) {
      // Avoid duplicating an existing active campaign for same sector+city
      const existing = await prisma.campaign.findFirst({
        where: { sector, city: s.city, status: "active" },
      });
      if (!existing) {
        const campaign = await prisma.campaign.create({
          data: {
            name: `${sector} – ${s.city} (AI)`,
            sector,
            city: s.city,
            region: s.region,
            status: "active",
          },
        });
        created.push({ campaignId: campaign.id, city: s.city });
      }
    }
  }

  return NextResponse.json({ suggestions, created, tokensUsed });
}
