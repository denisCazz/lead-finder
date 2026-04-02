import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await params;
  const body = await request.json();

  const message = await prisma.message.update({
    where: { id: parseInt(messageId) },
    data: {
      status: body.status,
      content: body.content ?? undefined,
      subject: body.subject ?? undefined,
    },
  });

  return NextResponse.json(message);
}
