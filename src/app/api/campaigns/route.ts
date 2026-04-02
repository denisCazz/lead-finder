import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { leads: true } } },
  });
  return NextResponse.json(campaigns);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, sector, region, city } = body;

  if (!name || !sector) {
    return NextResponse.json({ error: "name and sector are required" }, { status: 400 });
  }

  const campaign = await prisma.campaign.create({
    data: {
      name,
      sector,
      region: region || null,
      city: city || null,
      status: "active",
    },
  });

  return NextResponse.json(campaign, { status: 201 });
}
