import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendWhatsAppText } from "@/lib/whatsapp";

/**
 * GET /api/whatsapp/chats/[chatId] — Get chat messages
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const id = parseInt(chatId);

  const chat = await prisma.whatsAppChat.findUnique({
    where: { id },
    include: {
      lead: { select: { id: true, companyName: true, sector: true, email: true, phone: true } },
    },
  });

  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const messages = await prisma.whatsAppMessage.findMany({
    where: { chatId: id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    chat: {
      id: chat.id,
      phone: chat.phone,
      name: chat.name,
      lead: chat.lead,
    },
    messages: messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      body: m.body,
      status: m.status,
      createdAt: m.createdAt,
    })),
  });
}

/**
 * POST /api/whatsapp/chats/[chatId] — Send a reply in this conversation
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const id = parseInt(chatId);
  const { text } = await request.json();

  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const chat = await prisma.whatsAppChat.findUnique({ where: { id } });
  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  // Send via WhatsApp Cloud API
  const result = await sendWhatsAppText(chat.phone, text);

  // Save outgoing message
  const msg = await prisma.whatsAppMessage.create({
    data: {
      chatId: chat.id,
      waId: result.messageId || null,
      direction: "out",
      body: text,
      status: result.success ? "sent" : "failed",
    },
  });

  // Touch the chat updatedAt
  await prisma.whatsAppChat.update({
    where: { id: chat.id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({
    success: result.success,
    error: result.error,
    message: {
      id: msg.id,
      direction: "out",
      body: text,
      status: msg.status,
      createdAt: msg.createdAt,
    },
  });
}
