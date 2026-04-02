import * as cheerio from "cheerio";

export interface HtmlAnalysisResult {
  hasEcommerce: boolean;
  hasBooking: boolean;
  isMobileFriendly: boolean;
  hasModernDesign: boolean;
  hasCrm: boolean;
  detectedTechs: string[];
}

const ECOMMERCE_INDICATORS = [
  "woocommerce", "shopify", "magento", "prestashop", "opencart",
  "add-to-cart", "aggiungi-al-carrello", "carrello", "cart",
  "checkout", "shop", "negozio", "prodotti", "products",
  "prezzo", "price", "€", "acquista", "buy",
];

const BOOKING_INDICATORS = [
  "book", "prenota", "prenotazione", "prenotazioni", "booking",
  "reservation", "calendly", "appointlet", "acuity", "timely",
  "disponibilità", "availability", "appuntamento", "schedule",
];

const CRM_INDICATORS = [
  "area-clienti", "area clienti", "client area", "customer portal",
  "dashboard", "login", "accedi", "my-account", "mio-account",
  "gestionale", "crm", "ticket", "supporto-clienti",
];

const OUTDATED_INDICATORS = [
  "jquery.min.js", "bootstrap/3", "bootstrap/2",
  "font-awesome/4", "html4", "frameset", "marquee",
  "table cellpadding", "bgcolor", "align=\"center\"",
];

export async function analyzeHtml(url: string): Promise<HtmlAnalysisResult | null> {
  const targetUrl = url.startsWith("http") ? url : `https://${url}`;

  try {
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);
    const htmlLower = html.toLowerCase();
    const detectedTechs: string[] = [];

    // Check mobile-friendly (viewport meta tag)
    const viewport = $('meta[name="viewport"]').attr("content") || "";
    const isMobileFriendly = viewport.includes("width=device-width");

    // Check e-commerce
    const hasEcommerce = ECOMMERCE_INDICATORS.some((ind) => htmlLower.includes(ind));
    if (hasEcommerce) detectedTechs.push("e-commerce");

    // Check booking system
    const hasBooking = BOOKING_INDICATORS.some((ind) => htmlLower.includes(ind));
    if (hasBooking) detectedTechs.push("booking");

    // Check CRM/client area
    const hasCrm = CRM_INDICATORS.some((ind) => htmlLower.includes(ind));
    if (hasCrm) detectedTechs.push("crm/area-clienti");

    // Check modern design
    const isOutdated = OUTDATED_INDICATORS.some((ind) => htmlLower.includes(ind));
    const hasModernDesign = !isOutdated;

    // Detect common tech
    if (htmlLower.includes("wordpress") || htmlLower.includes("wp-content")) detectedTechs.push("WordPress");
    if (htmlLower.includes("shopify")) detectedTechs.push("Shopify");
    if (htmlLower.includes("woocommerce")) detectedTechs.push("WooCommerce");
    if (htmlLower.includes("react")) detectedTechs.push("React");
    if (htmlLower.includes("next")) detectedTechs.push("Next.js");
    if (htmlLower.includes("joomla")) detectedTechs.push("Joomla");
    if (htmlLower.includes("wix.com")) detectedTechs.push("Wix");
    if (htmlLower.includes("squarespace")) detectedTechs.push("Squarespace");

    return {
      hasEcommerce,
      hasBooking,
      isMobileFriendly,
      hasModernDesign,
      hasCrm,
      detectedTechs,
    };
  } catch (err) {
    console.error("HTML analysis error:", err);
    return null;
  }
}
