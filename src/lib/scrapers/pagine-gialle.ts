import * as cheerio from "cheerio";
import { randomDelay } from "../utils";

export interface ScrapedLead {
  companyName: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  source: string;
}

async function fetchWithRetry(
  url: string,
  maxRetries: number = 3
): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
          "Accept-Encoding": "gzip, deflate, br",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          "Sec-Ch-Ua": '"Chromium";v="125", "Not.A/Brand";v="24"',
          "Sec-Ch-Ua-Mobile": "?0",
          "Sec-Ch-Ua-Platform": '"Windows"',
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1",
          Referer: "https://www.paginegialle.it/",
        },
      });
      clearTimeout(timeout);
      return res;
    } catch (err) {
      clearTimeout(timeout);
      if (attempt === maxRetries) throw err;
      const backoff = attempt * 5000 + Math.random() * 3000;
      console.warn(
        `PagineGialle fetch attempt ${attempt}/${maxRetries} failed, retrying in ${Math.round(backoff)}ms...`
      );
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw new Error("fetchWithRetry: unreachable");
}

export async function scrapePagineGialle(
  sector: string,
  city: string,
  maxPages: number = 3
): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = [];

  for (let page = 1; page <= maxPages; page++) {
    try {
      const query = encodeURIComponent(sector);
      const location = encodeURIComponent(city);
      const url = `https://www.paginegialle.it/ricerca/${query}/${location}/p-${page}`;

      const res = await fetchWithRetry(url);

      if (!res.ok) {
        if (res.status !== 404) console.warn(`PagineGialle page ${page} returned ${res.status}`);
        break;
      }

      const html = await res.text();
      const $ = cheerio.load(html);

      $(".vcard").each((_, el) => {
        const companyName = $(el).find(".fn, .org").first().text().trim();
        const phone = $(el).find(".tel a").first().text().trim() ||
          $(el).find('[data-pag="phone"]').text().trim();
        const website = $(el).find('a[data-pag="website"]').attr("href") ||
          $(el).find('a.website').attr("href") || "";
        const address = $(el).find(".street-address").text().trim();

        if (companyName) {
          leads.push({
            companyName,
            phone: phone || undefined,
            website: website || undefined,
            address: address || undefined,
            city,
            source: "pagine_gialle",
          });
        }
      });

      // Also try alternative selectors for newer layout
      if (leads.length === 0) {
        $('[class*="listingItem"], [class*="search-result"]').each((_, el) => {
          const companyName = $(el).find("h2 a, h3 a, .company-name").first().text().trim();
          const phone = $(el).find('a[href^="tel:"]').first().text().trim();
          const website = $(el).find('a[href^="http"]:not([href*="paginegialle"])').first().attr("href") || "";
          const address = $(el).find(".address, .street").first().text().trim();

          if (companyName) {
            leads.push({
              companyName,
              phone: phone || undefined,
              website: website || undefined,
              address: address || undefined,
              city,
              source: "pagine_gialle",
            });
          }
        });
      }

      await randomDelay(3000, 6000);
    } catch (err) {
      console.error(`Error scraping PagineGialle page ${page}:`, err);
    }
  }

  return leads;
}
