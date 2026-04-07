import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "25");
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "";
  const sector = searchParams.get("sector") || "";
  const city = searchParams.get("city") || "";
  const scoreMin = searchParams.get("scoreMin") || "";
  const scoreMax = searchParams.get("scoreMax") || "";
  const hasEmail = searchParams.get("hasEmail") || "";
  const sortBy = searchParams.get("sortBy") || "createdAt";
  const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";

  const where: Record<string, unknown> = {};

  // Multi-field search: company, sector, city, email, phone, contactName
  if (search) {
    where.OR = [
      { companyName: { contains: search } },
      { sector: { contains: search } },
      { city: { contains: search } },
      { email: { contains: search } },
      { contactName: { contains: search } },
      { phone: { contains: search } },
    ];
  }
  if (status) {
    where.status = status;
  }
  if (sector) {
    where.sector = { contains: sector };
  }
  if (city) {
    where.city = { contains: city };
  }
  if (scoreMin) {
    where.score = { ...((where.score as Record<string, unknown>) || {}), gte: parseInt(scoreMin) };
  }
  if (scoreMax) {
    where.score = { ...((where.score as Record<string, unknown>) || {}), lte: parseInt(scoreMax) };
  }
  if (hasEmail === "yes") {
    where.email = { not: null };
  } else if (hasEmail === "no") {
    where.email = null;
  }

  // Allowed sort fields
  const allowedSort: Record<string, string> = {
    createdAt: "createdAt",
    score: "score",
    companyName: "companyName",
  };
  const orderField = allowedSort[sortBy] || "createdAt";

  const [leads, total, sectors, cities] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { [orderField]: sortDir },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.lead.count({ where }),
    prisma.lead.groupBy({ by: ["sector"], where: { sector: { not: null } }, orderBy: { _count: { sector: "desc" } }, take: 50 }),
    prisma.lead.groupBy({ by: ["city"], where: { city: { not: null } }, orderBy: { _count: { city: "desc" } }, take: 50 }),
  ]);

  return NextResponse.json({
    leads,
    total,
    sectors: sectors.map((s) => s.sector).filter(Boolean),
    cities: cities.map((c) => c.city).filter(Boolean),
  });
}
