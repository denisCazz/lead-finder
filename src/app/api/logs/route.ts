import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get("campaignId");
  const leadId = searchParams.get("leadId");
  const type = searchParams.get("type");
  const limit = parseInt(searchParams.get("limit") || "200");

  const where: Record<string, unknown> = {};
  if (campaignId) where.campaignId = parseInt(campaignId);
  if (leadId) where.leadId = parseInt(leadId);
  if (type && type !== "all") where.type = { contains: type };

  const logs = await prisma.activityLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      campaign: { select: { name: true } },
      lead: { select: { companyName: true } },
    },
  });

  return NextResponse.json(logs);
}
