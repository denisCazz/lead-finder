import { NextRequest, NextResponse } from "next/server";

const JOB_MAP: Record<string, string> = {
  daily: "/api/cron/daily",
  morning: "/api/cron/morning",
  "suggest-cities": "/api/ai/suggest-cities",
};

/**
 * POST /api/jobs/run
 * Proxy that triggers a cron/AI job server-side (never exposes CRON_SECRET to the client).
 * Protected by the auth middleware (cookie-based session).
 *
 * Body: { job: "daily" | "morning" | "suggest-cities", params?: Record<string, unknown> }
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { job, params } = body as { job: string; params?: Record<string, unknown> };

  if (!job || !JOB_MAP[job]) {
    return NextResponse.json(
      { error: `Unknown job "${job}". Valid: ${Object.keys(JOB_MAP).join(", ")}` },
      { status: 400 }
    );
  }

  const secret = process.env.CRON_SECRET || "";
  // Always call localhost directly — bypass Traefik/nginx which can strip custom headers
  const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
  const url = `${baseUrl}${JOB_MAP[job]}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "x-cron-secret": secret } : {}),
    },
    body: params ? JSON.stringify(params) : undefined,
  });

  const data = await response.json().catch(() => ({ error: "Non-JSON response from job" }));
  return NextResponse.json(data, { status: response.status });
}
