import { NextResponse } from "next/server";

const body = {
  error: "Deprecated route",
  message: "Usa /api/cron/continuous per l'Automazione Completa oppure /api/cron/daily e /api/cron/morning come worker interni Ricerca Clienti + Analisi Clienti e Invio Mail.",
  replacement: {
    continuous: "/api/cron/continuous",
    ricercaClientiAnalisiClienti: "/api/cron/daily",
    invioMail: "/api/cron/morning",
  },
};

export async function GET() {
  return NextResponse.json(body, { status: 410 });
}

export async function POST() {
  return NextResponse.json(body, { status: 410 });
}
