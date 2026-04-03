import { NextRequest, NextResponse } from "next/server";
import { runSendMailWorker } from "@/lib/automation/workers";

/**
 * WORKER: INVIO MAIL
 * Invia solo i messaggi email che l'AI ha gia' marcato come approved.
 * In modalita' sendAll invia tutte le email approvate; altrimenti rispetta il cap giornaliero.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  const envSecret = process.env.CRON_SECRET;
  const mask = (s: string | null | undefined) =>
    s ? `${s.slice(0, 3)}***${s.slice(-2)} (len=${s.length})` : "(not set)";
  console.log(`[cron/morning] x-cron-secret received: ${mask(secret)}`);
  console.log(`[cron/morning] CRON_SECRET env:         ${mask(envSecret)}`);
  if (envSecret && secret !== envSecret) {
    console.error(`[cron/morning] AUTH FAILED — header=${mask(secret)} env=${mask(envSecret)}`);
    return NextResponse.json({
      error: "Unauthorized",
      _debug: {
        headerReceived: !!secret,
        envSecretSet: !!envSecret,
        lengthMatch: secret?.length === envSecret?.length,
        headerLen: secret?.length ?? 0,
        envLen: envSecret?.length ?? 0,
      },
    }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as {
    sendAll?: boolean;
    suppressTelegramSummary?: boolean;
  };
  const forceRun = request.nextUrl.searchParams.get("force") === "true";
  const sendAll = body.sendAll === true || request.nextUrl.searchParams.get("sendAll") === "true";
  const results = await runSendMailWorker({
    forceRun,
    sendAll,
    suppressTelegramSummary: body.suppressTelegramSummary === true,
  });

  return NextResponse.json(results);
}

export const GET = POST; // allows cron services that send GET
