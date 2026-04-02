import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GPT-4o pricing (as of 2025): $5/1M input, $15/1M output — use blended avg
const COST_PER_TOKEN_EUR = 0.000009; // ~€0.009 per 1K tokens

function dateRange(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function GET() {
  const [today, week, month] = [dateRange(0), dateRange(7), dateRange(30)];

  // Token usage from analyses
  const [tokensToday, tokensWeek, tokensMonth] = await Promise.all([
    prisma.analysis.aggregate({ _sum: { aiTokensUsed: true }, where: { analyzedAt: { gte: today } } }),
    prisma.analysis.aggregate({ _sum: { aiTokensUsed: true }, where: { analyzedAt: { gte: week } } }),
    prisma.analysis.aggregate({ _sum: { aiTokensUsed: true }, where: { analyzedAt: { gte: month } } }),
  ]);

  // Token usage from activity logs (ai_generate, ai_city_suggestion)
  const logsWithTokens = await prisma.activityLog.findMany({
    where: {
      type: { in: ["ai_generate", "ai_city_suggestion", "ai_analysis"] },
      metadata: { not: null },
      createdAt: { gte: month },
    },
    select: { metadata: true, createdAt: true, type: true },
  });

  let logTokensToday = 0, logTokensWeek = 0, logTokensMonth = 0;
  for (const log of logsWithTokens) {
    if (!log.metadata) continue;
    try {
      const meta = JSON.parse(log.metadata);
      const t = meta.tokensUsed ?? 0;
      logTokensMonth += t;
      if (log.createdAt >= week) logTokensWeek += t;
      if (log.createdAt >= today) logTokensToday += t;
    } catch { /* ignore */ }
  }

  // Combine (analyses already counted in logs via ai_analysis type — avoid double count from analyses.aiTokensUsed if logs track them; use analyses as source of truth for AI tokens)
  const totalAnalysisTokensToday = tokensToday._sum.aiTokensUsed ?? 0;
  const totalAnalysisTokensWeek = tokensWeek._sum.aiTokensUsed ?? 0;
  const totalAnalysisTokensMonth = tokensMonth._sum.aiTokensUsed ?? 0;

  // ai_generate log tokens (not in analyses)
  const genLogsToday = logsWithTokens
    .filter((l) => l.type === "ai_generate" && l.createdAt >= today)
    .reduce((acc, l) => { try { return acc + (JSON.parse(l.metadata!).tokensUsed ?? 0); } catch { return acc; } }, 0);
  const genLogsWeek = logsWithTokens
    .filter((l) => l.type === "ai_generate" && l.createdAt >= week)
    .reduce((acc, l) => { try { return acc + (JSON.parse(l.metadata!).tokensUsed ?? 0); } catch { return acc; } }, 0);
  const genLogsMonth = logsWithTokens
    .filter((l) => l.type === "ai_generate")
    .reduce((acc, l) => { try { return acc + (JSON.parse(l.metadata!).tokensUsed ?? 0); } catch { return acc; } }, 0);

  const citySugLogsToday = logsWithTokens
    .filter((l) => l.type === "ai_city_suggestion" && l.createdAt >= today)
    .reduce((acc, l) => { try { return acc + (JSON.parse(l.metadata!).tokensUsed ?? 0); } catch { return acc; } }, 0);
  const citySugLogsWeek = logsWithTokens
    .filter((l) => l.type === "ai_city_suggestion" && l.createdAt >= week)
    .reduce((acc, l) => { try { return acc + (JSON.parse(l.metadata!).tokensUsed ?? 0); } catch { return acc; } }, 0);
  const citySugLogsMonth = logsWithTokens
    .filter((l) => l.type === "ai_city_suggestion")
    .reduce((acc, l) => { try { return acc + (JSON.parse(l.metadata!).tokensUsed ?? 0); } catch { return acc; } }, 0);

  const summary = {
    tokens: {
      today: totalAnalysisTokensToday + genLogsToday + citySugLogsToday,
      week: totalAnalysisTokensWeek + genLogsWeek + citySugLogsWeek,
      month: totalAnalysisTokensMonth + genLogsMonth + citySugLogsMonth,
    },
    costEur: {
      today: (totalAnalysisTokensToday + genLogsToday + citySugLogsToday) * COST_PER_TOKEN_EUR,
      week: (totalAnalysisTokensWeek + genLogsWeek + citySugLogsWeek) * COST_PER_TOKEN_EUR,
      month: (totalAnalysisTokensMonth + genLogsMonth + citySugLogsMonth) * COST_PER_TOKEN_EUR,
    },
  };

  // Email stats
  const [emailsToday, emailsWeek, emailsMonth] = await Promise.all([
    prisma.message.count({ where: { status: "sent", type: "email", sentAt: { gte: today } } }),
    prisma.message.count({ where: { status: "sent", type: "email", sentAt: { gte: week } } }),
    prisma.message.count({ where: { status: "sent", type: "email", sentAt: { gte: month } } }),
  ]);

  // WhatsApp drafts generated
  const [waDraftsToday, waDraftsWeek, waDraftsMonth] = await Promise.all([
    prisma.message.count({ where: { whatsappContent: { not: null }, createdAt: { gte: today } } }),
    prisma.message.count({ where: { whatsappContent: { not: null }, createdAt: { gte: week } } }),
    prisma.message.count({ where: { whatsappContent: { not: null }, createdAt: { gte: month } } }),
  ]);

  // Lead stats
  const [leadsToday, leadsWeek, leadsMonth] = await Promise.all([
    prisma.lead.count({ where: { createdAt: { gte: today } } }),
    prisma.lead.count({ where: { createdAt: { gte: week } } }),
    prisma.lead.count({ where: { createdAt: { gte: month } } }),
  ]);

  // Recent activity log for history table
  const recentLogs = await prisma.activityLog.findMany({
    where: { type: { in: ["ai_analysis", "ai_generate", "send", "ai_city_suggestion"] } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true, type: true, message: true, metadata: true, createdAt: true,
      lead: { select: { companyName: true } },
    },
  });

  const history = recentLogs.map((log) => {
    let tokens = 0;
    try { tokens = JSON.parse(log.metadata ?? "{}").tokensUsed ?? 0; } catch { /* */ }
    return {
      id: log.id,
      type: log.type,
      message: log.message,
      companyName: log.lead?.companyName ?? null,
      tokens,
      costEur: tokens * COST_PER_TOKEN_EUR,
      createdAt: log.createdAt,
    };
  });

  return NextResponse.json({
    summary,
    emails: { today: emailsToday, week: emailsWeek, month: emailsMonth },
    whatsappDrafts: { today: waDraftsToday, week: waDraftsWeek, month: waDraftsMonth },
    leads: { today: leadsToday, week: leadsWeek, month: leadsMonth },
    history,
  });
}
