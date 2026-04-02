import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const settings = await prisma.setting.findMany();
  const map: Record<string, string> = {};
  for (const s of settings) {
    map[s.key] = s.value;
  }
  return NextResponse.json({ settings: map });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  // Support both { settings: {...} } wrapper and flat { key: value } format
  const entries: Record<string, string> = body.settings ?? body;

  for (const [key, value] of Object.entries(entries)) {
    if (typeof value !== "string") continue;
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  return NextResponse.json({ success: true });
}
