import { NextRequest, NextResponse } from "next/server";

export function authCheck(request: NextRequest): NextResponse | null {
  const password = process.env.AUTH_PASSWORD;
  if (!password) return null; // no auth configured

  const cookie = request.cookies.get("auth_token");
  if (cookie?.value === password) return null; // authorized

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function cronCheck(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;

  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return null;

  const url = new URL(request.url);
  if (url.searchParams.get("secret") === secret) return null;

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
