import { NextRequest, NextResponse } from "next/server";
import { runLeadBackfillWorker } from "@/lib/automation/workers";

function authorize(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  const envSecret = process.env.CRON_SECRET;

  if (envSecret && secret !== envSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  return null;
}

async function handler(request: NextRequest) {
  const unauthorized = authorize(request);
  if (unauthorized) return unauthorized;

  const result = await runLeadBackfillWorker();
  return NextResponse.json(result);
}

export const POST = handler;
export const GET = handler;