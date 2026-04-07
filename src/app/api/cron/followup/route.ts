import { NextRequest, NextResponse } from "next/server";
import { runFollowUpWorker } from "@/lib/automation/workers";

async function handler(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  const envSecret = process.env.CRON_SECRET;

  if (envSecret && secret !== envSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const results = await runFollowUpWorker();

  return NextResponse.json(results);
}

export const POST = handler;
export const GET = handler;
