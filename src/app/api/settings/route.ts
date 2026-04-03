import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const defaults: Record<string, string> = {
    app_url: process.env.NEXT_PUBLIC_APP_URL || "",
    email_from: process.env.EMAIL_FROM || "noreply@bitora.it",
    max_emails_per_day: "20",
    auto_send_min_score: "70",
    auto_send_enabled: "true",
    automation_enabled: "true",
    automation_interval_minutes: "120",
    automation_sectors: process.env.AUTOMATION_SECTORS || "",
    last_continuous_run_at: "",
  };

  const settings = await prisma.setting.findMany();
  const map: Record<string, string> = { ...defaults };
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
