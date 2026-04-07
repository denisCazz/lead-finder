import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/whatsapp/chats — List all WhatsApp conversations
 */
export async function GET() {
  const chats = await prisma.whatsAppChat.findMany({
    include: {
      lead: { select: { id: true, companyName: true, sector: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const result = chats.map((c) => ({
    id: c.id,
    phone: c.phone,
    name: c.name,
    leadId: c.lead?.id || null,
    leadName: c.lead?.companyName || null,
    leadSector: c.lead?.sector || null,
    lastMessage: c.messages[0]?.body || null,
    lastMessageDir: c.messages[0]?.direction || null,
    lastMessageAt: c.messages[0]?.createdAt || c.createdAt,
    updatedAt: c.updatedAt,
  }));

  return NextResponse.json({ chats: result });
}
