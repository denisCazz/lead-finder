import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runLeadResearchAnalysisWorker, runSendMailWorker, runFollowUpWorker } from "@/lib/automation/workers";
import { clearPromptCache, loadPrompts, suggestNewCities } from "@/lib/openai";
import { notifyDailySummary } from "@/lib/telegram";

function parseSectors(raw: string | undefined) {
  return (raw || "")
    .split(/[\n,;]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

async function resolveAutomationSectors(raw: string | undefined) {
  const configured = parseSectors(raw);
  if (configured.length > 0) {
    return { sectors: configured, source: "settings" as const };
  }

  const [campaignSectors, cityLogSectors, leadSectors] = await Promise.all([
    prisma.campaign.findMany({
      where: { sector: { not: "" } },
      distinct: ["sector"],
      orderBy: { updatedAt: "desc" },
      select: { sector: true },
      take: 8,
    }),
    prisma.cityLog.findMany({
      where: { sector: { not: "" } },
      distinct: ["sector"],
      orderBy: { scrapedAt: "desc" },
      select: { sector: true },
      take: 8,
    }),
    prisma.lead.findMany({
      where: { sector: { not: null, notIn: [""] } },
      distinct: ["sector"],
      orderBy: { updatedAt: "desc" },
      select: { sector: true },
      take: 8,
    }),
  ]);

  const merged = [
    ...campaignSectors.map((item) => item.sector),
    ...cityLogSectors.map((item) => item.sector),
    ...leadSectors.map((item) => item.sector || ""),
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    sectors: Array.from(new Set(merged)).slice(0, 8),
    source: "history" as const,
  };
}

async function ensureCampaigns(sectors: string[]) {
  const created: Array<{ sector: string; campaignId: number; city: string }> = [];
  const selected: Array<{ sector: string; campaignId: number; city: string; source: "created" | "reused" }> = [];
  const skipped: Array<{ sector: string; reason: string }> = [];

  if (sectors.length === 0) {
    return { created, selected, skipped };
  }

  await loadPrompts();

  try {
    for (const sector of sectors) {
      const active = await prisma.campaign.findFirst({
        where: {
          sector,
          status: "active",
          OR: [
            { name: { startsWith: "AI |" } },
            { name: { contains: "(AI)" } },
            { name: { contains: "(Auto)" } },
          ],
        },
        orderBy: { createdAt: "desc" },
      });

      if (active) {
        selected.push({ sector, campaignId: active.id, city: active.city || active.region || "N/A", source: "reused" });
        continue;
      }

      const cityLogs = await prisma.cityLog.findMany({
        where: { sector },
        orderBy: { scrapedAt: "desc" },
      });

      const suggestions = await suggestNewCities({
        sector,
        alreadyWorkedCities: cityLogs.map((row) => ({
          city: row.city,
          region: row.region,
          leadsFound: row.leadsFound,
        })),
      });

      const preferred = suggestions.data.find((item) => item.priority === "alta") || suggestions.data[0];
      if (!preferred) {
        skipped.push({ sector, reason: "AI non ha restituito suggerimenti validi" });
        continue;
      }

      const campaign = await prisma.campaign.create({
        data: {
          name: `AI | ${sector} | ${preferred.city}`,
          sector,
          city: preferred.city,
          region: preferred.region,
          status: "active",
        },
      });

      await prisma.activityLog.create({
        data: {
          campaignId: campaign.id,
          type: "ai_campaign_created",
          message: `🤖 Automazione completa: nuova campagna AI ${sector} a ${preferred.city}`,
          metadata: JSON.stringify({
            source: "continuous",
            sector,
            city: preferred.city,
            region: preferred.region,
            priority: preferred.priority,
            estimatedLeads: preferred.estimatedLeads,
            tokensUsed: suggestions.tokensUsed,
          }),
        },
      });

      created.push({ sector, campaignId: campaign.id, city: preferred.city });
      selected.push({ sector, campaignId: campaign.id, city: preferred.city, source: "created" });
    }
  } finally {
    clearPromptCache();
  }

  return { created, selected, skipped };
}

async function handler(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  const envSecret = process.env.CRON_SECRET;
  const forceRun = request.nextUrl.searchParams.get("force") === "true";

  if (envSecret && secret !== envSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const settingsRows = await prisma.setting.findMany({
    where: {
      key: {
        in: [
          "automation_enabled",
          "automation_sectors",
          "automation_interval_minutes",
          "last_continuous_run_at",
        ],
      },
    },
  });
  const settings = Object.fromEntries(settingsRows.map((row) => [row.key, row.value]));

  const automationEnabled = settings.automation_enabled !== "false";
  if (!automationEnabled && !forceRun) {
    return NextResponse.json({ skipped: true, reason: "automation_enabled is false" });
  }

  const intervalMinutes = Math.max(15, parseInt(settings.automation_interval_minutes || "120", 10) || 120);
  const lastRunAt = settings.last_continuous_run_at ? new Date(settings.last_continuous_run_at) : null;
  const now = new Date();
  if (!forceRun && lastRunAt && now.getTime() - lastRunAt.getTime() < intervalMinutes * 60 * 1000) {
    return NextResponse.json({
      skipped: true,
      reason: `Interval not reached (${intervalMinutes} min)`,
      nextEligibleAt: new Date(lastRunAt.getTime() + intervalMinutes * 60 * 1000).toISOString(),
    });
  }

  const sectorResolution = await resolveAutomationSectors(settings.automation_sectors);
  const sectors = sectorResolution.sectors;

  if (sectors.length === 0) {
    await prisma.activityLog.create({
      data: {
        type: "automation_continuous_error",
        message: "❌ Automazione completa fermata: nessun settore configurato o ricavabile dallo storico",
        metadata: JSON.stringify({
          source: sectorResolution.source,
          configuredValue: settings.automation_sectors || "",
        }),
      },
    });

    return NextResponse.json({
      ok: false,
      error: "No automation sectors available",
      reason: "Configura almeno un settore in Impostazioni > Automazione oppure crea storico sufficiente per il fallback.",
      source: sectorResolution.source,
    }, { status: 409 });
  }

  const summaryLog = await prisma.activityLog.create({
    data: {
      type: "automation_continuous_start",
      message: `♻️ Automazione completa avviata (${sectors.length} settori configurati)`,
      metadata: JSON.stringify({ sectors, intervalMinutes, forceRun, sectorSource: sectorResolution.source }),
    },
  });

  const campaignResult = await ensureCampaigns(sectors);
  if (campaignResult.selected.length === 0) {
    await prisma.activityLog.create({
      data: {
        type: "automation_continuous_error",
        message: "❌ Automazione completa fermata: l'AI non ha prodotto campagne utilizzabili",
        metadata: JSON.stringify({
          logId: summaryLog.id,
          sectors,
          sectorSource: sectorResolution.source,
          skippedCampaigns: campaignResult.skipped,
        }),
      },
    });

    return NextResponse.json({
      ok: false,
      error: "No campaigns selected",
      sectors,
      sectorSource: sectorResolution.source,
      campaigns: campaignResult,
    }, { status: 409 });
  }

  const dailyData = await runLeadResearchAnalysisWorker({
    campaignIds: campaignResult.selected.map((item) => item.campaignId),
    closeCampaigns: true,
    suppressTelegramSummary: true,
    telegramBatchSize: 30,
  });
  const morningData = await runSendMailWorker({
    forceRun: true,
    sendAll: true,
    suppressTelegramSummary: true,
  });

  // Run follow-up worker for leads that haven't replied
  const followUpData = await runFollowUpWorker();

  const daily = {
    ok: dailyData.errors.length === 0,
    status: dailyData.errors.length === 0 ? 200 : 207,
    path: "/api/cron/daily",
    data: dailyData,
  };
  const morning = {
    ok: !morningData.failed && !morningData.skipped,
    status: morningData.skipped ? 200 : morningData.failed > 0 ? 207 : 200,
    path: "/api/cron/morning",
    data: morningData,
  };

  await prisma.setting.upsert({
    where: { key: "last_continuous_run_at" },
    update: { value: now.toISOString() },
    create: { key: "last_continuous_run_at", value: now.toISOString() },
  });

  const ok = daily.ok && morning.ok;
  const reusedCount = campaignResult.selected.filter((item) => item.source === "reused").length;
  const summaryErrors = [
    ...(((daily.data as { errors?: string[] })?.errors) || []),
    ...(((morning.data as { errors?: string[] })?.errors) || []),
    ...followUpData.errors,
  ];

  await prisma.activityLog.create({
    data: {
      type: ok ? "automation_continuous_done" : "automation_continuous_error",
      message: ok
        ? `✅ Automazione completa: ${campaignResult.created.length} campagne create, ricerca clienti, analisi clienti e invio mail completati`
        : "❌ Automazione completa conclusa con errori",
      metadata: JSON.stringify({
        logId: summaryLog.id,
        sectorSource: sectorResolution.source,
        createdCampaigns: campaignResult.created,
        selectedCampaigns: campaignResult.selected,
        skippedCampaigns: campaignResult.skipped,
        reusedCount,
        dailyStatus: daily.status,
        morningStatus: morning.status,
        ricercaClientiStatus: daily.status,
        invioMailStatus: morning.status,
        summaryErrors,
      }),
    },
  });

  // Gather CRM stats for smart Telegram notification
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const [negotiatingLeads, wonCount, repliesCount, scheduledFollowUps] = await Promise.all([
    prisma.lead.findMany({
      where: { dealStage: "negotiating" },
      select: { companyName: true, sector: true },
    }),
    prisma.lead.count({ where: { dealStage: "won" } }),
    prisma.lead.count({ where: { status: "replied", updatedAt: { gte: todayStart } } }),
    prisma.lead.count({
      where: { nextFollowUp: { not: null, lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) } },
    }),
  ]);

  try {
    await notifyDailySummary({
      newLeads: Number((daily.data as { scraped?: number })?.scraped || 0),
      analyzed: Number((daily.data as { analyzed?: number })?.analyzed || 0),
      messagesGenerated: Number((daily.data as { generated?: number })?.generated || 0),
      messagesSent: Number((morning.data as { sent?: number })?.sent || 0),
      errors: summaryErrors,
      campaignsCreated: campaignResult.created.length,
      campaignsProcessed: Number((daily.data as { campaignsProcessed?: number })?.campaignsProcessed || 0),
      repliesReceived: repliesCount,
      negotiating: negotiatingLeads,
      wonCount,
      scheduledFollowUps,
    });
  } catch {
    // Telegram is optional
  }

  return NextResponse.json({
    ok,
    intervalMinutes,
    sectors,
    sectorSource: sectorResolution.source,
    campaigns: campaignResult,
    ricercaClienti: daily,
    invioMail: morning,
    followUp: followUpData,
    daily,
    morning,
    summaryErrors,
    ranAt: now.toISOString(),
  }, { status: ok ? 200 : 207 });
}

export const POST = handler;
export const GET = handler;