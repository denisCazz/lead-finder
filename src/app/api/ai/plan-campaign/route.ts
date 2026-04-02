import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { planCampaignWithAI } from "@/lib/openai";

export async function POST(request: NextRequest) {
  const { prompt } = await request.json();

  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  // 1. Ask GPT to plan the campaign
  const aiResult = await planCampaignWithAI(prompt);
  const plan = aiResult.data;

  // 2. Create the campaign in DB
  const campaign = await prisma.campaign.create({
    data: {
      name: plan.campaignName,
      sector: plan.sector,
      city: plan.city || null,
      region: plan.region || null,
    },
  });

  // 3. Log the AI planning step
  await prisma.activityLog.create({
    data: {
      campaignId: campaign.id,
      type: "ai_plan",
      message: `🤖 AI ha pianificato la campagna "${plan.campaignName}" — Settore: ${plan.sector}, Target: ${plan.targetProfile}`,
      progress: 0,
      metadata: JSON.stringify({
        prompt,
        plan,
        tokensUsed: aiResult.tokensUsed,
        model: aiResult.model,
        durationMs: aiResult.durationMs,
      }),
    },
  });

  return NextResponse.json({
    success: true,
    campaign,
    plan,
    ai: {
      tokensUsed: aiResult.tokensUsed,
      durationMs: aiResult.durationMs,
    },
  });
}
