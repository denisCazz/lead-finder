import puppeteer from "puppeteer";
import { randomDelay } from "../utils";

export interface ScrapedLead {
  companyName: string;
  contactName?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  region?: string;
  rating?: number;
  source: string;
}

export async function scrapeGoogleMaps(
  query: string,
  maxResults: number = 20
): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = [];

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });

    // Accept cookies if prompted
    try {
      const acceptBtn = await page.$('button[aria-label*="Accetta"], button[aria-label*="Accept"]');
      if (acceptBtn) await acceptBtn.click();
      await randomDelay(1000, 2000);
    } catch { /* no cookie banner */ }

    // Wait for results
    await page.waitForSelector('[role="feed"]', { timeout: 10000 }).catch(() => null);

    // Scroll to load more results
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        const feed = document.querySelector('[role="feed"]');
        if (feed) feed.scrollTop = feed.scrollHeight;
      });
      await randomDelay(2000, 4000);
    }

    // Get all result links
    const resultLinks = await page.$$('a[href*="/maps/place/"]');
    const uniqueLinks: string[] = [];
    for (const link of resultLinks) {
      const href = await link.evaluate((el) => el.getAttribute("href"));
      if (href && !uniqueLinks.includes(href)) uniqueLinks.push(href);
      if (uniqueLinks.length >= maxResults) break;
    }

    // Visit each result to get details
    for (const href of uniqueLinks.slice(0, maxResults)) {
      try {
        await page.goto(href, { waitUntil: "networkidle2", timeout: 15000 });
        await randomDelay(2000, 5000);

        const data = await page.evaluate(() => {
          const nameEl = document.querySelector("h1");
          const name = nameEl?.textContent?.trim() || "";

          // Phone
          const phoneEl = document.querySelector('button[data-item-id*="phone"] div.fontBodyMedium') ||
            document.querySelector('a[href^="tel:"]');
          const phone = phoneEl?.textContent?.trim() || "";

          // Website
          const webEl = document.querySelector('a[data-item-id="authority"]') ||
            document.querySelector('a[href^="http"]:not([href*="google"])');
          const website = webEl?.getAttribute("href") || "";

          // Address
          const addrEl = document.querySelector('button[data-item-id="address"] div.fontBodyMedium');
          const address = addrEl?.textContent?.trim() || "";

          // Rating
          const ratingEl = document.querySelector('div.fontDisplayLarge');
          const rating = ratingEl ? parseFloat(ratingEl.textContent || "0") : undefined;

          return { name, phone, website, address, rating };
        });

        if (data.name) {
          leads.push({
            companyName: data.name,
            phone: data.phone || undefined,
            website: data.website || undefined,
            address: data.address || undefined,
            rating: data.rating,
            source: "google_maps",
          });
        }
      } catch (err) {
        console.error("Error scraping result:", err);
      }
    }
  } finally {
    await browser.close();
  }

  return leads;
}
