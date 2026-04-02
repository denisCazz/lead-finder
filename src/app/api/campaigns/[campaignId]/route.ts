import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await params;
  const body = await request.json();

  const campaign = await prisma.campaign.update({
    where: { id: parseInt(campaignId) },
    data: body,
  });

  return NextResponse.json(campaign);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await params;
  await prisma.campaign.delete({ where: { id: parseInt(campaignId) } });
  return NextResponse.json({ success: true });
}
