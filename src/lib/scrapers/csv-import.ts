export interface CsvLead {
  companyName: string;
  contactName?: string;
  email?: string;
  phone?: string;
  website?: string;
  sector?: string;
  city?: string;
  region?: string;
}

export function parseCsvLeads(csvContent: string): CsvLead[] {
  const lines = csvContent.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/["']/g, ""));
  const leads: CsvLead[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length < headers.length) continue;

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx]?.trim().replace(/^["']|["']$/g, "") || "";
    });

    const companyName =
      row["company"] || row["azienda"] || row["company name"] || row["nome azienda"] || row["name"] || row["nome"];

    if (!companyName) continue;

    leads.push({
      companyName,
      contactName: row["contact"] || row["referente"] || row["contact name"] || row["nome referente"] || undefined,
      email: row["email"] || row["e-mail"] || undefined,
      phone: row["phone"] || row["telefono"] || row["tel"] || undefined,
      website: row["website"] || row["sito"] || row["sito web"] || row["url"] || undefined,
      sector: row["sector"] || row["settore"] || row["industry"] || undefined,
      city: row["city"] || row["città"] || row["citta"] || undefined,
      region: row["region"] || row["regione"] || undefined,
    });
  }

  return leads;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}
