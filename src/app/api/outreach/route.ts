import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/outreach
 * Returns leads that need manual outreach:
 * - Has phone but no email (WhatsApp candidates)
 * - OR: has email + message draft but score < auto_send_min_score (manual email queue)
 * - Status is NOT "contacted" or "rejected"
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sector = searchParams.get("sector") || undefined;
  const city = searchParams.get("city") || undefined;
  const priority = searchParams.get("priority") || undefined; // alta|media|bassa
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = 25;

  const settingRow = await prisma.setting.findUnique({ where: { key: "auto_send_min_score" } });
  const minScore = parseInt(settingRow?.value || "70", 10);

  const where = {
    status: { notIn: ["contacted", "rejected"] as string[] },
    OR: [
      // Phone-only: WhatsApp candidate
      { phone: { not: null }, email: null },
      // Has email but score too low for auto-send — needs manual decision
      {
        email: { not: null },
        score: { lt: minScore },
        messages: { some: { status: "draft" } },
      },
    ],
    ...(sector && { sector }),
    ...(city && { city }),
  };

  const [total, leads] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      include: {
        messages: {
          where: { status: "draft" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        analyses: {
          orderBy: { analyzedAt: "desc" },
          take: 1,
          select: { aiScore: true, suggestedService: true },
        },
      },
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  // Apply priority filter (derived from score)
  const filtered = priority
    ? leads.filter((l) => {
        if (priority === "alta") return l.score >= 70;
        if (priority === "media") return l.score >= 40 && l.score < 70;
        if (priority === "bassa") return l.score < 40;
        return true;
      })
    : leads;

  return NextResponse.json({ leads: filtered, total, page, minScore });
}

/**
 * PATCH /api/outreach
 * Mark a lead as "contacted" manually.
 */
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { leadId, note } = body;
  if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

  await prisma.lead.update({
    where: { id: leadId },
    data: { status: "contacted" },
  });

  if (note) {
    await prisma.activityLog.create({
      data: {
        leadId,
        type: "manual_contact",
        message: `📱 Contatto manuale segnato per lead #${leadId}${note ? `: ${note}` : ""}`,
      },
    });
  }

  return NextResponse.json({ success: true });
}
