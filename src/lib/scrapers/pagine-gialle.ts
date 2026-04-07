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

const PG_HEADERS: Record<string, string> = {
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
};

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
        headers: PG_HEADERS,
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

// ---------- detail page: extract phone + website from JSON-LD ----------
interface DetailData {
  phone?: string;
  website?: string;
}

async function fetchDetailPage(detailUrl: string): Promise<DetailData> {
  try {
    const res = await fetchWithRetry(detailUrl);
    if (!res.ok) return {};
    const html = await res.text();
    const $ = cheerio.load(html);

    let phone = "";
    let website = "";

    // 1) JSON-LD structured data (most reliable)
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).text());
        if (json.telephone) phone = json.telephone;
        if (json.url && !json.url.includes("paginegialle")) website = json.url;
        // contactPoint array may have mobile numbers
        if (Array.isArray(json.contactPoint)) {
          for (const cp of json.contactPoint) {
            if (cp.telephone) {
              const digits = cp.telephone.replace(/[^\d]/g, "");
              if (/^(?:39)?3\d{8,9}$/.test(digits)) {
                phone = cp.telephone;
                break;
              }
            }
          }
        }
      } catch { /* invalid json */ }
    });

    // 2) Website from data-pag="www" link
    if (!website) {
      website = $('a[data-pag="www"]').attr("href") || "";
    }

    return { phone: phone || undefined, website: website || undefined };
  } catch (err) {
    console.warn(`PagineGialle detail fetch failed for ${detailUrl}:`, err);
    return {};
  }
}

// ---------- main scraper ----------
export async function scrapePagineGialle(
  sector: string,
  city: string,
  maxPages: number = 3
): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = [];

  // Phase 1: collect basic info + detail URLs from listing pages
  interface ListingItem {
    companyName: string;
    address: string;
    detailUrl: string;
  }
  const listings: ListingItem[] = [];

  for (let page = 1; page <= maxPages; page++) {
    try {
      const query = encodeURIComponent(sector);
      const location = encodeURIComponent(city);
      const url = `https://www.paginegialle.it/ricerca/${query}/${location}/p-${page}`;
      console.log(`[PagineGialle] Fetching listing page ${page}: ${url}`);

      const res = await fetchWithRetry(url);

      if (!res.ok) {
        console.warn(`[PagineGialle] Page ${page} returned ${res.status}`);
        if (res.status !== 404) break;
        continue;
      }

      const html = await res.text();
      const $ = cheerio.load(html);
      let pageCount = 0;

      // Current layout uses .search-itm containers
      $(".search-itm").each((_, el) => {
        const companyName = $(el).find("h2.search-itm__rag").text().trim()
          .replace(/\s+/g, " "); // collapse whitespace from the icon spans

        // Address from .search-itm__adr
        const addrEl = $(el).find(".search-itm__adr");
        const address = addrEl.text().trim().replace(/\s+/g, " ");

        // Detail page URL from main link
        const detailUrl = $(el).find("h2.search-itm__rag").closest("a").attr("href")
          || $(el).find('a[href*="paginegialle.it/"]').not('[href*="ricerca"]').first().attr("href")
          || "";

        if (companyName && detailUrl) {
          const fullUrl = detailUrl.startsWith("http") ? detailUrl : `https://www.paginegialle.it${detailUrl}`;
          listings.push({ companyName, address, detailUrl: fullUrl });
          pageCount++;
        }
      });

      console.log(`[PagineGialle] Page ${page}: found ${pageCount} listings`);
      if (pageCount === 0) break; // no more results

      await randomDelay(2000, 4000);
    } catch (err) {
      console.error(`[PagineGialle] Error scraping listing page ${page}:`, err);
    }
  }

  console.log(`[PagineGialle] Total listings found: ${listings.length}. Fetching detail pages...`);

  // Phase 2: visit detail pages in batches for phone + website
  const BATCH_SIZE = 5;
  for (let i = 0; i < listings.length; i += BATCH_SIZE) {
    const batch = listings.slice(i, i + BATCH_SIZE);
    const details = await Promise.allSettled(
      batch.map((item) => fetchDetailPage(item.detailUrl))
    );

    for (let j = 0; j < batch.length; j++) {
      const listing = batch[j];
      const settled = details[j];
      const detail: DetailData =
        settled.status === "fulfilled" ? settled.value : {};

      // Prefer mobile number
      let bestPhone = detail.phone || "";
      if (bestPhone) {
        const digits = bestPhone.replace(/[^\d]/g, "");
        // Already got it, but check if it's mobile
        if (!/^(?:39)?3\d{8,9}$/.test(digits)) {
          // Keep it anyway, it's better than nothing
        }
      }

      leads.push({
        companyName: listing.companyName,
        phone: bestPhone || undefined,
        website: detail.website || undefined,
        address: listing.address || undefined,
        city,
        source: "pagine_gialle",
      });
    }

    if (i + BATCH_SIZE < listings.length) {
      await randomDelay(1500, 3000);
    }
  }

  console.log(`[PagineGialle] Scraping complete: ${leads.length} leads`);
  return leads;
}
