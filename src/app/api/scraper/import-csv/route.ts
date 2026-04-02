import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseCsvLeads } from "@/lib/scrapers/csv-import";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const content = await file.text();
  const leads = parseCsvLeads(content);

  let imported = 0;
  for (const lead of leads) {
    try {
      await prisma.lead.create({
        data: {
          companyName: lead.companyName,
          contactName: lead.contactName || null,
          email: lead.email || null,
          phone: lead.phone || null,
          website: lead.website || null,
          sector: lead.sector || null,
          city: lead.city || null,
          region: lead.region || null,
          source: "csv_import",
        },
      });
      imported++;
    } catch {
      // Duplicate or error, skip
    }
  }

  return NextResponse.json({ success: true, total: leads.length, imported });
}
