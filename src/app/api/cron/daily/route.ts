import { NextRequest, NextResponse } from "next/server";
import { runLeadResearchAnalysisWorker } from "@/lib/automation/workers";

/**
 * WORKER: RICERCA CLIENTI + ANALISI CLIENTI
 * 1. Cerca nuovi lead per le campagne AI selezionate → scrive CityLog
 * 2. Analizza i nuovi lead mai analizzati
 * 3. Chiede all'AI se il lead e' pronto per invio email, revisione manuale o scarto
 * 4. Genera testi email/WhatsApp e marca i messaggi come approved o draft
 */
async function handler(request: NextRequest) {
  // Auth check — skip if no CRON_SECRET configured
  const secret = request.headers.get("x-cron-secret");
  const envSecret = process.env.CRON_SECRET;
  const mask = (s: string | null | undefined) =>
    s ? `${s.slice(0, 3)}***${s.slice(-2)} (len=${s.length})` : "(not set)";
  console.log(`[cron/daily] method=${request.method}`);
  console.log(`[cron/daily] x-cron-secret received: ${mask(secret)}`);
  console.log(`[cron/daily] CRON_SECRET env:         ${mask(envSecret)}`);
  if (envSecret && secret !== envSecret) {
    console.error(`[cron/daily] AUTH FAILED — header=${mask(secret)} env=${mask(envSecret)}`);
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
    campaignIds?: number[];
    closeCampaigns?: boolean;
    suppressTelegramSummary?: boolean;
    telegramBatchSize?: number;
  };
  const results = await runLeadResearchAnalysisWorker(body);
  return NextResponse.json(results);
}

export const POST = handler;
export const GET = handler; // allows cron services that send GET
