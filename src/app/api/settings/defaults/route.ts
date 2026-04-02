import { NextResponse } from "next/server";
import { DEFAULT_PROMPTS } from "@/lib/prompts";

export async function GET() {
  return NextResponse.json({ defaults: DEFAULT_PROMPTS });
}
