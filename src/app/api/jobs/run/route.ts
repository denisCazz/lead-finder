import { NextRequest, NextResponse } from "next/server";

const JOB_MAP: Record<string, string> = {
  continuous: "/api/cron/continuous?force=true",
  backfill: "/api/cron/backfill",
  daily: "/api/cron/daily",
  morning: "/api/cron/morning",
  "suggest-cities": "/api/ai/suggest-cities",
};

/**
 * POST /api/jobs/run
 * Proxy that triggers a cron/AI job server-side (never exposes CRON_SECRET to the client).
 * Protected by the auth middleware (cookie-based session).
 *
 * Body: { job: "continuous" | "backfill" | "daily" | "morning" | "suggest-cities", params?: Record<string, unknown> }
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
  const port = process.env.PORT || 3000;
  const baseUrl = `http://localhost:${port}`;
  // force=true bypasses setting gates for manual test runs
  const jobPath = job === "morning" ? `${JOB_MAP[job]}?force=true` : JOB_MAP[job];
  const url = `${baseUrl}${jobPath}`;

  const mask = (s: string) => s ? `${s.slice(0, 3)}***${s.slice(-2)} (len=${s.length})` : "(empty)";
  console.log(`[jobs/run] → ${url}`);
  console.log(`[jobs/run] CRON_SECRET: ${mask(secret)}`);
  console.log(`[jobs/run] header sent: x-cron-secret=${mask(secret)}`);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-cron-secret": secret } : {}),
      },
      body: params ? JSON.stringify(params) : undefined,
    });
  } catch (fetchErr) {
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    console.error(`[jobs/run] fetch failed: ${msg}`);
    return NextResponse.json({
      error: "Internal fetch failed",
      detail: msg,
      _debug: { url, port, secretSet: !!secret },
    }, { status: 502 });
  }

  console.log(`[jobs/run] response status: ${response.status}`);
  const data = await response.json().catch(() => ({ error: "Non-JSON response from job" }));

  // Attach debug metadata when it fails so the UI shows the root cause
  if (!response.ok) {
    return NextResponse.json({
      ...data,
      _debug: { url, port, secretSet: !!secret, responseStatus: response.status },
    }, { status: response.status });
  }

  return NextResponse.json(data, { status: response.status });
}
