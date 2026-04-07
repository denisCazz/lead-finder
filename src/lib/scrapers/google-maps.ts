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

  const execPath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
  console.log(`[GoogleMaps] Launching Puppeteer (executablePath: ${execPath || "bundled"})...`);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: execPath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--lang=it-IT",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    );
    // Hide webdriver flag
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });
    await page.setExtraHTTPHeaders({ "Accept-Language": "it-IT,it;q=0.9" });

    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    console.log(`[GoogleMaps] Navigating to: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });

    // ---------- Handle Google consent ----------
    // Strategy 1: consent.google.com redirect — click "Accetta tutto" button
    const consentUrl = page.url();
    if (consentUrl.includes("consent.google")) {
      console.log("[GoogleMaps] Consent page detected, attempting to accept...");
      try {
        // The "Accept all" button - try multiple selectors
        const consentBtn = await page.evaluateHandle(() => {
          // Find button containing "Accetta tutto" or "Accept all"
          const buttons = Array.from(document.querySelectorAll("button"));
          return buttons.find((b) => {
            const text = b.textContent?.toLowerCase() || "";
            return text.includes("accetta tutto") || text.includes("accept all");
          }) || null;
        });
        if (consentBtn) {
          await (consentBtn as unknown as import('puppeteer').ElementHandle<Element>).click();
          await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
          console.log("[GoogleMaps] Consent accepted, now on:", page.url());
        }
      } catch (e) {
        console.warn("[GoogleMaps] Consent click failed:", e);
      }
    }

    // Strategy 2: in-page consent dialog
    try {
      const inPageBtn = await page.$('button[aria-label*="Accetta tutto"], button[aria-label*="Accept all"], form[action*="consent"] button');
      if (inPageBtn) {
        await inPageBtn.click();
        await randomDelay(2000, 3000);
        console.log("[GoogleMaps] In-page consent accepted");
      }
    } catch { /* no in-page consent */ }

    // If still on consent page, try submitting the form
    if (page.url().includes("consent")) {
      try {
        await page.evaluate(() => {
          const form = document.querySelector('form[action*="consent"]') as HTMLFormElement;
          if (form) form.submit();
        });
        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 }).catch(() => {});
      } catch { /* */ }
    }

    // Navigate again to maps if we ended up somewhere else
    if (!page.url().includes("/maps/")) {
      console.log("[GoogleMaps] Not on maps page, navigating again...");
      await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });
      await randomDelay(1000, 2000);
    }

    console.log(`[GoogleMaps] Current URL: ${page.url()}`);

    // Wait for results feed
    const hasFeed = await page.waitForSelector('[role="feed"]', { timeout: 10000 }).catch(() => null);
    if (!hasFeed) {
      console.warn("[GoogleMaps] No results feed found. Page title:", await page.title());
      // Take a screenshot path for debugging (optional, only in dev)
      return leads;
    }

    // Scroll to load more results
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        const feed = document.querySelector('[role="feed"]');
        if (feed) feed.scrollTop = feed.scrollHeight;
      });
      await randomDelay(1500, 3000);
    }

    // Get all result links
    const resultLinks = await page.$$('a[href*="/maps/place/"]');
    const uniqueLinks: string[] = [];
    for (const link of resultLinks) {
      const href = await link.evaluate((el) => el.getAttribute("href"));
      if (href && !uniqueLinks.includes(href)) uniqueLinks.push(href);
      if (uniqueLinks.length >= maxResults) break;
    }

    console.log(`[GoogleMaps] Found ${uniqueLinks.length} unique place links`);

    // Visit each result to get details
    for (const href of uniqueLinks.slice(0, maxResults)) {
      try {
        await page.goto(href, { waitUntil: "networkidle2", timeout: 15000 });
        await randomDelay(1500, 3000);

        const data = await page.evaluate(() => {
          const nameEl = document.querySelector("h1");
          const name = nameEl?.textContent?.trim() || "";

          // Phone - try multiple selectors
          const phoneEl = document.querySelector('button[data-item-id*="phone"] div.fontBodyMedium') ||
            document.querySelector('a[data-item-id*="phone"]') ||
            document.querySelector('a[href^="tel:"]');
          const phone = phoneEl?.textContent?.trim() || "";

          // Collect all tel: links for mobile number detection
          const allPhones: string[] = [];
          document.querySelectorAll('a[href^="tel:"]').forEach((el) => {
            const h = el.getAttribute("href");
            if (h) allPhones.push(h.replace("tel:", "").trim());
          });
          // Also check data-item-id phone buttons
          document.querySelectorAll('button[data-item-id*="phone"]').forEach((el) => {
            const t = el.querySelector("div.fontBodyMedium")?.textContent?.trim();
            if (t && !allPhones.includes(t)) allPhones.push(t);
          });
          if (phone && !allPhones.includes(phone)) allPhones.unshift(phone);

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

          return { name, phone, allPhones, website, address, rating };
        });

        if (data.name) {
          // Prefer mobile number (starts with 3) over landline
          let bestPhone = data.phone;
          for (const p of data.allPhones) {
            const digits = p.replace(/[^\d]/g, "");
            if (/^(?:\+?39)?3\d{8,9}$/.test(digits)) {
              bestPhone = p;
              break;
            }
          }

          leads.push({
            companyName: data.name,
            phone: bestPhone || undefined,
            website: data.website || undefined,
            address: data.address || undefined,
            rating: data.rating,
            source: "google_maps",
          });
        }
      } catch (err) {
        console.error("[GoogleMaps] Error scraping result:", err);
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`[GoogleMaps] Scraping complete: ${leads.length} leads`);
  return leads;
}
