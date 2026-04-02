import { NextRequest, NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/telegram";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { text } = body;

  const result = await sendTelegramMessage(text || "✅ Test da Lead Finder - Connessione Telegram OK!");
  if (result) {
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: "Failed to send Telegram message" }, { status: 500 });
}
