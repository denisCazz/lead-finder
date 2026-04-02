import * as cheerio from "cheerio";

export interface HtmlAnalysisResult {
  hasEcommerce: boolean;
  hasBooking: boolean;
  isMobileFriendly: boolean;
  hasModernDesign: boolean;
  hasCrm: boolean;
  hasAnalytics: boolean;
  hasSocialPresence: boolean;
  hasWhatsappWidget: boolean;
  hasContactForm: boolean;
  detectedTechs: string[];
  pageTitle: string;
  metaDescription: string;
  extractedText: string;
}

// Strong: actual platform names or cart-specific classes — single match is enough
const ECOMMERCE_STRONG = [
  "woocommerce", "shopify", "magento", "prestashop", "opencart",
  "add-to-cart", "aggiungi al carrello", "aggiungi-al-carrello",
  "data-product_id", "wc-product", "product-price",
];

// Weak: generic words that alone don't prove an actual e-commerce
const ECOMMERCE_WEAK = [
  "carrello", "checkout", "/cart", "/shop", "/store",
  "acquista ora", "buy now", "ordina online",
];

// Strong: known booking platforms or specific integration widgets
const BOOKING_STRONG = [
  "calendly", "appointlet", "acuity", "timely", "reservio",
  "planyo", "bookeo", "simplybook", "setmore", "fresha",
  "opentable", "thefork", "quandoo", "treatwell",
  "data-booking", "booking-widget", "prenotazione-online",
];

// Weak: generic Italian words
const BOOKING_WEAK = [
  "prenota online", "book online", "prenota ora", "prenota il tuo",
  "sistema di prenotazione", "disponibilità online", "appuntamento online",
];

// Strong: actual CRM/client-area software
const CRM_STRONG = [
  "salesforce", "hubspot", "zoho", "freshdesk", "zendesk",
  "area-clienti", "area clienti", "portale clienti", "cliente/login",
  "my-account", "gestionale", "mio account",
];

// Weak
const CRM_WEAK = [
  "accedi all'area", "area riservata", "accesso clienti",
];

const OUTDATED_INDICATORS = [
  "bootstrap/3.", "bootstrap/2.", "bootstrap@3.", "bootstrap@2.",
  "font-awesome/4.", "jquery/1.", "jquery/2.",
  "html4", "frameset", "<marquee", "<blink",
  "table cellpadding", "bgcolor=", " align=\"center\"",
];

export async function analyzeHtml(url: string): Promise<HtmlAnalysisResult | null> {
  const targetUrl = url.startsWith("http") ? url : `https://${url}`;

  try {
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);
    const htmlLower = html.toLowerCase();
    const detectedTechs: string[] = [];

    // ── Metadata ────────────────────────────────────────────────────────────
    const pageTitle = $("title").first().text().trim() || "";
    const metaDescription = $('meta[name="description"]').attr("content")?.trim() || "";

    // ── Extracted text for AI ────────────────────────────────────────────────
    $("script, style, noscript, iframe, svg, header, nav, footer").remove();
    const rawText = $("body").text().replace(/\s+/g, " ").trim();
    const extractedText = rawText.slice(0, 4000); // increased from 3000

    // ── Mobile-friendly ──────────────────────────────────────────────────────
    const viewport = $('meta[name="viewport"]').attr("content") || "";
    const isMobileFriendly = viewport.includes("width=device-width");

    // ── E-commerce ───────────────────────────────────────────────────────────
    // Has e-commerce if there is at least 1 strong signal OR 2+ weak signals
    const ecommerceStrongHits = ECOMMERCE_STRONG.filter((ind) => htmlLower.includes(ind)).length;
    const ecommerceWeakHits = ECOMMERCE_WEAK.filter((ind) => htmlLower.includes(ind)).length;
    const hasEcommerce = ecommerceStrongHits >= 1 || ecommerceWeakHits >= 2;
    if (hasEcommerce) detectedTechs.push("e-commerce");

    // ── Booking ──────────────────────────────────────────────────────────────
    const bookingStrongHits = BOOKING_STRONG.filter((ind) => htmlLower.includes(ind)).length;
    const bookingWeakHits = BOOKING_WEAK.filter((ind) => htmlLower.includes(ind)).length;
    const hasBooking = bookingStrongHits >= 1 || bookingWeakHits >= 2;
    if (hasBooking) detectedTechs.push("booking");

    // ── CRM / Client area ────────────────────────────────────────────────────
    const crmStrongHits = CRM_STRONG.filter((ind) => htmlLower.includes(ind)).length;
    const crmWeakHits = CRM_WEAK.filter((ind) => htmlLower.includes(ind)).length;
    const hasCrm = crmStrongHits >= 1 || crmWeakHits >= 2;
    if (hasCrm) detectedTechs.push("crm/area-clienti");

    // ── Analytics ────────────────────────────────────────────────────────────
    const hasAnalytics =
      htmlLower.includes("google-analytics") ||
      htmlLower.includes("gtag(") ||
      htmlLower.includes("googletagmanager") ||
      htmlLower.includes("fbq(") ||
      htmlLower.includes("facebook pixel") ||
      htmlLower.includes("_ga") ||
      htmlLower.includes("hotjar") ||
      htmlLower.includes("matomo") ||
      htmlLower.includes("plausible");
    if (hasAnalytics) detectedTechs.push("analytics");

    // ── Social media presence ────────────────────────────────────────────────
    const hasSocialPresence =
      htmlLower.includes("facebook.com/") ||
      htmlLower.includes("instagram.com/") ||
      htmlLower.includes("linkedin.com/") ||
      htmlLower.includes("tiktok.com/");
    if (hasSocialPresence) detectedTechs.push("social");

    // ── WhatsApp widget ──────────────────────────────────────────────────────
    const hasWhatsappWidget =
      htmlLower.includes("wa.me/") ||
      htmlLower.includes("api.whatsapp.com") ||
      htmlLower.includes("whatsapp-chat") ||
      htmlLower.includes("wa-widget");
    if (hasWhatsappWidget) detectedTechs.push("whatsapp-widget");

    // ── Contact form ─────────────────────────────────────────────────────────
    const hasContactForm =
      $('form[action*="contact"], form[action*="contatt"], form[id*="contact"], form[class*="contact"]').length > 0 ||
      $('input[name="email"], input[type="email"]').length > 0;

    // ── Modern design ─────────────────────────────────────────────────────────
    const isOutdated = OUTDATED_INDICATORS.filter((ind) => htmlLower.includes(ind)).length >= 2;
    const hasModernDesign = !isOutdated;

    // ── Detect common technologies ───────────────────────────────────────────
    if (htmlLower.includes("wordpress") || htmlLower.includes("wp-content")) detectedTechs.push("WordPress");
    if (htmlLower.includes("shopify") && !detectedTechs.includes("Shopify")) detectedTechs.push("Shopify");
    if (htmlLower.includes("woocommerce") && !detectedTechs.includes("WooCommerce")) detectedTechs.push("WooCommerce");
    if (htmlLower.includes("joomla")) detectedTechs.push("Joomla");
    if (htmlLower.includes("wix.com/")) detectedTechs.push("Wix");
    if (htmlLower.includes("squarespace")) detectedTechs.push("Squarespace");
    if (htmlLower.includes("webflow")) detectedTechs.push("Webflow");
    if (htmlLower.includes("react")) detectedTechs.push("React");
    if (htmlLower.includes("__next") || htmlLower.includes("next.js")) detectedTechs.push("Next.js");

    return {
      hasEcommerce,
      hasBooking,
      isMobileFriendly,
      hasModernDesign,
      hasCrm,
      hasAnalytics,
      hasSocialPresence,
      hasWhatsappWidget,
      hasContactForm,
      detectedTechs,
      pageTitle,
      metaDescription,
      extractedText,
    };
  } catch (err) {
    console.warn("HTML analysis error:", err instanceof Error ? err.message : err);
    return null;
  }
}
