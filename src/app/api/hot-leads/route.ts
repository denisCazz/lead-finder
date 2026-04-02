import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const minScore = parseInt(searchParams.get("minScore") || "75");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const skip = (page - 1) * limit;

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where: { score: { gte: minScore } },
      orderBy: { score: "desc" },
      skip,
      take: limit,
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            type: true,
            status: true,
            subject: true,
            sentAt: true,
          },
        },
        analyses: {
          orderBy: { analyzedAt: "desc" },
          take: 1,
          select: {
            aiScore: true,
            suggestedService: true,
            issuesJson: true,
            performanceScore: true,
          },
        },
      },
    }),
    prisma.lead.count({ where: { score: { gte: minScore } } }),
  ]);

  const enriched = leads.map((lead) => {
    const latestMessage = lead.messages[0] ?? null;
    const latestAnalysis = lead.analyses[0] ?? null;
    return {
      id: lead.id,
      companyName: lead.companyName,
      sector: lead.sector,
      city: lead.city,
      region: lead.region,
      website: lead.website,
      email: lead.email,
      phone: lead.phone,
      score: lead.score,
      status: lead.status,
      createdAt: lead.createdAt,
      aiScore: latestAnalysis?.aiScore ?? null,
      suggestedService: latestAnalysis?.suggestedService ?? null,
      issues: latestAnalysis?.issuesJson ? JSON.parse(latestAnalysis.issuesJson) : [],
      performanceScore: latestAnalysis?.performanceScore ?? null,
      message: latestMessage,
      emailSent: latestMessage?.status === "sent" && latestMessage?.type === "email",
      whatsappReady: latestMessage?.type === "whatsapp" && latestMessage?.status === "draft",
    };
  });

  return NextResponse.json({ leads: enriched, total, page, pages: Math.ceil(total / limit) });
}
