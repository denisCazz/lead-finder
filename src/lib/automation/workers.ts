import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import {
  clearPromptCache,
  diagnoseSiteWithAI,
  generateColdEmail,
  generateFollowUpMessage,
  generateWhatsAppMessage,
  LeadQualification,
  loadPrompts,
  mapIssuesToProblemString,
  qualifyLeadWithAI,
  SiteDiagnosis,
} from "@/lib/openai";
import { analyzeHtml } from "@/lib/analyzers/html-analyzer";
import { analyzePageSpeed } from "@/lib/analyzers/pagespeed";
import { calculateScore } from "@/lib/analyzers/scorer";
import { scrapeGoogleMaps } from "@/lib/scrapers/google-maps";
import { scrapePagineGialle } from "@/lib/scrapers/pagine-gialle";
import { notifyDailySummary, notifyLeadBatch, sendTelegramMessage, TelegramLeadSummary } from "@/lib/telegram";
import { extractDomain } from "@/lib/utils";
import { sendWhatsAppTemplate, sendWhatsAppText, isWhatsAppConfigured } from "@/lib/whatsapp";
import * as cheerio from "cheerio";

export type DailyWorkerInput = {
  campaignIds?: number[];
  closeCampaigns?: boolean;
  suppressTelegramSummary?: boolean;
  telegramBatchSize?: number;
};

export type DailyWorkerResult = {
  campaignsProcessed: number;
  scraped: number;
  analyzed: number;
  diagnosed: number;
  generated: number;
  readyToSend: number;
  manualReview: number;
  rejected: number;
  leadNotificationBatches: number;
  totalTokens: number;
  errors: string[];
};

export type MorningWorkerInput = {
  forceRun?: boolean;
  sendAll?: boolean;
  suppressTelegramSummary?: boolean;
};

export type MorningWorkerResult = {
  sent: number;
  failed: number;
  errors: string[];
  cap: number;
  sentTodayBefore: number;
  sendAll: boolean;
  processed: number;
  skipped?: true;
  reason?: string;
};

export type BackfillWorkerResult = {
  pendingBefore: number;
  pendingAfter: number;
  emailEnriched: number;
  analyzed: number;
  diagnosed: number;
  generated: number;
  readyToSend: number;
  manualReview: number;
  rejected: number;
  messagesSent: number;
  sendFailed: number;
  totalTokens: number;
  errors: string[];
};

const WORKER_BATCH_SIZE = 50;
const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function normalizeEmail(email: string): string | null {
  const normalized = email
    .trim()
    .toLowerCase()
    .replace(/^mailto:/, "")
    .replace(/[)>.,;:]+$/g, "");

  if (!normalized || !normalized.includes("@")) return null;
  if (normalized.includes("example.com")) return null;
  if (/["'\s]/.test(normalized)) return null;
  return normalized;
}

function rankEmail(email: string, website: string | null | undefined): number {
  const domain = website ? extractDomain(website) : null;
  const emailDomain = email.split("@")[1] || "";
  let score = 0;

  if (domain && emailDomain === domain) score += 4;
  if (domain && emailDomain === `www.${domain}`) score += 3;
  if (/^(info|hello|ciao|studio|amministrazione|commerciale|contatti)@/.test(email)) score += 2;
  if (/^(noreply|no-reply|donotreply)@/.test(email)) score -= 5;
  if (email.includes(".png") || email.includes(".jpg") || email.includes(".jpeg") || email.includes(".webp")) score -= 10;

  return score;
}

async function fetchPage(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function findLeadEmailFromWebsite(website: string): Promise<string | null> {
  const domain = extractDomain(website);
  if (!domain) return null;

  const baseUrl = website.startsWith("http") ? website : `https://${website}`;
  const visited = new Set<string>();
  const queue = [baseUrl];
  const found = new Set<string>();

  while (queue.length > 0 && visited.size < 4) {
    const currentUrl = queue.shift();
    if (!currentUrl || visited.has(currentUrl)) continue;
    visited.add(currentUrl);

    const html = await fetchPage(currentUrl);
    if (!html) continue;

    for (const match of html.matchAll(EMAIL_REGEX)) {
      const email = normalizeEmail(match[0]);
      if (email) found.add(email);
    }

    const $ = cheerio.load(html);

    $("a[href^='mailto:']").each((_, element) => {
      const href = $(element).attr("href");
      const email = normalizeEmail(href || "");
      if (email) found.add(email);
    });

    $("a[href]").each((_, element) => {
      if (queue.length + visited.size >= 6) return;

      const href = $(element).attr("href");
      if (!href) return;
      const label = ($(element).text() || href).toLowerCase();
      if (!/(contact|contatt|chi-siamo|about|studio|azienda|info)/.test(label)) return;

      try {
        const nextUrl = new URL(href, currentUrl);
        if (nextUrl.hostname.replace(/^www\./, "") !== domain) return;
        if (!visited.has(nextUrl.toString())) queue.push(nextUrl.toString());
      } catch {
        // Ignore malformed links.
      }
    });
  }

  const ranked = Array.from(found).sort((left, right) => rankEmail(right, website) - rankEmail(left, website));
  return ranked[0] || null;
}

async function enrichLeadEmail(lead: { id: number; companyName: string; website: string | null; email: string | null; campaignId: number | null }) {
  if (lead.email || !lead.website) return lead.email;

  const discoveredEmail = await findLeadEmailFromWebsite(lead.website);
  if (!discoveredEmail) return null;

  await prisma.lead.update({
    where: { id: lead.id },
    data: { email: discoveredEmail },
  });

  await prisma.activityLog.create({
    data: {
      leadId: lead.id,
      campaignId: lead.campaignId,
      type: "analyze",
      message: `📬 Email trovata automaticamente per ${lead.companyName}: ${discoveredEmail}`,
    },
  });

  return discoveredEmail;
}

// ─── Mobile phone extraction from websites ─────────────────────────────
// Italian mobile numbers: +39 3xx, 3xx (cellulare). Landlines start with 0.
const PHONE_REGEX = /(?:\+39\s?)?(?:3\d{2}[\s./\-]?\d{3}[\s./\-]?\d{4}|3\d{2}[\s./\-]?\d{6,7})/g;
const PHONE_BLACKLIST = ["3000000000", "3333333333", "3123456789", "3001234567"];

function normalizePhone(raw: string): string | null {
  // Strip everything except digits and leading +
  const digits = raw.replace(/[^\d+]/g, "");
  let normalized = digits;

  // Normalize +39 prefix
  if (normalized.startsWith("+39")) normalized = normalized.slice(3);
  if (normalized.startsWith("0039")) normalized = normalized.slice(4);

  // Must start with 3 (Italian mobile) and be 9-10 digits
  if (!/^3\d{8,9}$/.test(normalized)) return null;
  if (PHONE_BLACKLIST.includes(normalized)) return null;

  return `+39${normalized}`;
}

function rankPhone(phone: string, existingPhone: string | null): number {
  let score = 0;
  // Prefer numbers we don't already have
  if (existingPhone && phone === existingPhone) score -= 5;
  // Prefer 10-digit numbers (standard Italian mobile: 3xx xxx xxxx)
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12) score += 2; // +39 + 10 digits = 12 with country code stripped = standard
  return score;
}

async function findMobilePhoneFromWebsite(website: string): Promise<string | null> {
  const domain = extractDomain(website);
  if (!domain) return null;

  const baseUrl = website.startsWith("http") ? website : `https://${website}`;
  const visited = new Set<string>();
  const queue = [baseUrl];
  const found = new Set<string>();

  while (queue.length > 0 && visited.size < 4) {
    const currentUrl = queue.shift();
    if (!currentUrl || visited.has(currentUrl)) continue;
    visited.add(currentUrl);

    const html = await fetchPage(currentUrl);
    if (!html) continue;

    // Extract from tel: links (most reliable source)
    const $ = cheerio.load(html);
    $("a[href^='tel:']").each((_, element) => {
      const href = $(element).attr("href") || "";
      const phone = normalizePhone(href.replace(/^tel:/, ""));
      if (phone) found.add(phone);
    });

    // Extract from visible text via regex
    for (const match of html.matchAll(PHONE_REGEX)) {
      const phone = normalizePhone(match[0]);
      if (phone) found.add(phone);
    }

    // Follow contact/about links to find more numbers
    $("a[href]").each((_, element) => {
      if (queue.length + visited.size >= 6) return;
      const href = $(element).attr("href");
      if (!href) return;
      const label = ($(element).text() || href).toLowerCase();
      if (!/(contact|contatt|chi-siamo|about|studio|azienda|info|dove.siamo)/.test(label)) return;
      try {
        const nextUrl = new URL(href, currentUrl);
        if (nextUrl.hostname.replace(/^www\./, "") !== domain) return;
        if (!visited.has(nextUrl.toString())) queue.push(nextUrl.toString());
      } catch {
        // Ignore malformed links.
      }
    });
  }

  if (found.size === 0) return null;

  // Rank and return best mobile number
  const ranked = Array.from(found).sort((a, b) => rankPhone(b, null) - rankPhone(a, null));
  return ranked[0] || null;
}

async function enrichLeadPhone(lead: { id: number; companyName: string; website: string | null; phone: string | null; campaignId: number | null }): Promise<string | null> {
  if (!lead.website) return lead.phone || null;

  // Check if existing phone is already a mobile number
  if (lead.phone) {
    const normalized = normalizePhone(lead.phone);
    if (normalized) return normalized; // Already a mobile number
  }

  // Try to find a mobile number from the website
  const discoveredPhone = await findMobilePhoneFromWebsite(lead.website);
  if (!discoveredPhone) return lead.phone || null;

  // Update the lead with the mobile number (prefer mobile over landline)
  await prisma.lead.update({
    where: { id: lead.id },
    data: { phone: discoveredPhone },
  });

  await prisma.activityLog.create({
    data: {
      leadId: lead.id,
      campaignId: lead.campaignId,
      type: "analyze",
      message: `📱 Cellulare trovato per ${lead.companyName}: ${discoveredPhone}${lead.phone ? ` (sostituisce fisso ${lead.phone})` : ""}`,
    },
  });

  return discoveredPhone;
}

export async function runLeadResearchAnalysisWorker(input: DailyWorkerInput = {}): Promise<DailyWorkerResult> {
  const hasCampaignFilter = Array.isArray(input.campaignIds);
  const targetCampaignIds = Array.isArray(input.campaignIds)
    ? input.campaignIds.map((value) => Number(value)).filter((value) => Number.isFinite(value))
    : [];
  const closeCampaigns = input.closeCampaigns !== false;
  const suppressTelegramSummary = input.suppressTelegramSummary === true;
  const telegramBatchSize = Math.max(1, Number(input.telegramBatchSize || 30));

  await loadPrompts();

  const results: DailyWorkerResult = {
    campaignsProcessed: 0,
    scraped: 0,
    analyzed: 0,
    diagnosed: 0,
    generated: 0,
    readyToSend: 0,
    manualReview: 0,
    rejected: 0,
    leadNotificationBatches: 0,
    totalTokens: 0,
    errors: [],
  };

  const telegramLeadBuffer: TelegramLeadSummary[] = [];

  async function flushLeadBatch() {
    if (telegramLeadBuffer.length === 0) return;

    results.leadNotificationBatches++;
    const batch = telegramLeadBuffer.splice(0, telegramLeadBuffer.length);

    try {
      await notifyLeadBatch({
        leads: batch,
        batchNumber: results.leadNotificationBatches,
        batchSize: telegramBatchSize,
        totalCollected: results.scraped,
      });
      await prisma.activityLog.create({
        data: {
          type: "telegram_batch",
          message: `📦 Telegram: inviato batch #${results.leadNotificationBatches} con ${batch.length} lead`,
          metadata: JSON.stringify({ batchSize: batch.length, totalCollected: results.scraped }),
        },
      });
    } catch {
      results.errors.push(`Telegram batch #${results.leadNotificationBatches}: invio fallito`);
    }
  }

  try {
    const campaigns = await prisma.campaign.findMany({
      where: hasCampaignFilter ? { id: { in: targetCampaignIds } } : { status: "active" },
    });

    for (const campaign of campaigns) {
      try {
        results.campaignsProcessed++;
        const cityLabel = campaign.city || campaign.region || "Italia";
        const query = `${campaign.sector} ${cityLabel}`;

        await prisma.activityLog.create({
          data: { campaignId: campaign.id, type: "scrape_start", message: `🔎 Ricerca clienti: avvio scraping "${query}"` },
        });

        const [gmLeads, pgLeads] = await Promise.allSettled([
          scrapeGoogleMaps(query, 10),
          scrapePagineGialle(campaign.sector, cityLabel, 10),
        ]);

        if (gmLeads.status === "rejected") {
          const message = gmLeads.reason instanceof Error ? gmLeads.reason.message : String(gmLeads.reason);
          results.errors.push(`Google Maps ${campaign.name}: ${message}`);
        }
        if (pgLeads.status === "rejected") {
          const message = pgLeads.reason instanceof Error ? pgLeads.reason.message : String(pgLeads.reason);
          results.errors.push(`PagineGialle ${campaign.name}: ${message}`);
        }

        const allLeads = [
          ...(gmLeads.status === "fulfilled" ? gmLeads.value : []),
          ...(pgLeads.status === "fulfilled" ? pgLeads.value : []),
        ];

        let newForCampaign = 0;
        const seen = new Set<string>();
        for (const lead of allLeads) {
          const domain = lead.website ? extractDomain(lead.website) : null;
          const dedup = domain || lead.companyName.toLowerCase();
          if (seen.has(dedup)) continue;
          seen.add(dedup);

          if (domain) {
            const exists = await prisma.lead.findFirst({ where: { website: domain } });
            if (exists) continue;
          }

          const created = await prisma.lead.create({
            data: {
              companyName: lead.companyName,
              website: domain,
              phone: lead.phone || null,
              address: lead.address || null,
              city: lead.city || campaign.city || null,
              region: campaign.region || null,
              sector: campaign.sector,
              source: lead.source || "google_maps",
              status: "new",
              campaignId: campaign.id,
            },
          });
          results.scraped++;
          newForCampaign++;
          telegramLeadBuffer.push({
            id: created.id,
            companyName: created.companyName,
            sector: created.sector,
            city: created.city,
            website: created.website,
            score: created.score,
          });
          if (telegramLeadBuffer.length >= telegramBatchSize) {
            await flushLeadBatch();
          }
        }

        if (campaign.city || campaign.region) {
          await prisma.cityLog.create({
            data: {
              city: campaign.city || campaign.region || "Italia",
              region: campaign.region,
              sector: campaign.sector,
              campaignId: campaign.id,
              leadsFound: newForCampaign,
            },
          });
        }

        await prisma.activityLog.create({
          data: {
            campaignId: campaign.id,
            type: "scrape_done",
            message: `✅ Ricerca clienti completata: ${newForCampaign} nuovi lead per "${query}"`,
            metadata: JSON.stringify({
              googleMapsResults: gmLeads.status === "fulfilled" ? gmLeads.value.length : 0,
              pagineGialleResults: pgLeads.status === "fulfilled" ? pgLeads.value.length : 0,
              hadScraperErrors: gmLeads.status === "rejected" || pgLeads.status === "rejected",
            }),
          },
        });

        if (closeCampaigns) {
          await prisma.campaign.update({
            where: { id: campaign.id },
            data: { status: "completed" },
          });

          await prisma.activityLog.create({
            data: {
              campaignId: campaign.id,
              type: "campaign_completed",
              message: `🏁 Campagna chiusa automaticamente dopo ricerca clienti e analisi: "${campaign.name}"`,
            },
          });
        }
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        results.errors.push(`Scrape ${campaign.name}: ${errMsg}`);
      }
    }

    await flushLeadBatch();

    const analysisWhere = {
      analyses: { none: {} },
      ...(hasCampaignFilter ? { campaignId: { in: targetCampaignIds } } : {}),
    };

    while (true) {
      const pendingLeads = await prisma.lead.findMany({
        where: analysisWhere,
        orderBy: { createdAt: "asc" },
        take: WORKER_BATCH_SIZE,
      });

      if (pendingLeads.length === 0) break;

      for (const lead of pendingLeads) {
        try {
          const leadEmail = await enrichLeadEmail(lead);
          await enrichLeadPhone(lead);

          if (!lead.website) {
            await prisma.analysis.create({
              data: {
                leadId: lead.id,
                performanceScore: null,
                lcp: null,
                fid: null,
                cls: null,
                isMobileFriendly: false,
                hasEcommerce: false,
                hasBooking: false,
                hasCrm: false,
                hasModernDesign: false,
                issuesJson: JSON.stringify(["Nessun sito web disponibile per l'analisi automatica"]),
                suggestedService: "Sito vetrina o landing page professionale",
                aiDiagnosis: null,
                aiScore: null,
                aiTokensUsed: 0,
              },
            });

            await prisma.lead.update({
              where: { id: lead.id },
              data: { score: leadEmail ? 35 : 20, status: "analyzed", email: leadEmail || lead.email },
            });

            await prisma.activityLog.create({
              data: {
                leadId: lead.id,
                campaignId: lead.campaignId,
                type: "analyze",
                message: `🧾 Analisi ridotta completata per ${lead.companyName}: nessun sito disponibile`,
              },
            });

            results.analyzed++;
            continue;
          }

          const fullUrl = lead.website.startsWith("http") ? lead.website : `https://${lead.website}`;

          const [pageSpeed, htmlResult] = await Promise.allSettled([
            analyzePageSpeed(fullUrl),
            analyzeHtml(fullUrl),
          ]);

          const ps = pageSpeed.status === "fulfilled" ? pageSpeed.value : null;
          const html = htmlResult.status === "fulfilled" ? htmlResult.value : null;
          const scoreResult = calculateScore(ps, html);

          let aiDiagnosisJson: string | null = null;
          let aiScore: number | null = null;
          let aiTokens = 0;
          let diagnosis: SiteDiagnosis | null = null;

          if (html?.extractedText) {
            try {
              const diagResult = await diagnoseSiteWithAI({
                companyName: lead.companyName,
                sector: lead.sector,
                website: lead.website,
                pageTitle: html.pageTitle,
                metaDescription: html.metaDescription,
                extractedText: html.extractedText,
                performanceScore: ps?.performanceScore ?? null,
                hasEcommerce: html.hasEcommerce,
                hasBooking: html.hasBooking,
                isMobileFriendly: html.isMobileFriendly,
                hasModernDesign: html.hasModernDesign,
                hasCrm: html.hasCrm,
                hasAnalytics: html.hasAnalytics,
                hasSocialPresence: html.hasSocialPresence,
                hasWhatsappWidget: html.hasWhatsappWidget,
                hasContactForm: html.hasContactForm,
                detectedTechs: html.detectedTechs,
              });

              aiDiagnosisJson = JSON.stringify(diagResult.data);
              aiScore = diagResult.data.aiScore;
              diagnosis = diagResult.data;
              aiTokens = diagResult.tokensUsed;
              results.totalTokens += diagResult.tokensUsed;
              results.diagnosed++;

              await prisma.activityLog.create({
                data: {
                  leadId: lead.id,
                  campaignId: lead.campaignId,
                  type: "ai_analysis",
                  message: `🧠 Diagnosi AI ${lead.companyName}: score ${aiScore}/100`,
                  metadata: JSON.stringify({
                    tokensUsed: diagResult.tokensUsed,
                    durationMs: diagResult.durationMs,
                    confidence: diagResult.data.confidence,
                  }),
                },
              });
            } catch {
              // fallback to technical analysis only
            }
          }

          await prisma.analysis.create({
            data: {
              leadId: lead.id,
              performanceScore: ps?.performanceScore || null,
              lcp: ps?.lcp || null,
              fid: ps?.fid || null,
              cls: ps?.cls || null,
              isMobileFriendly: html?.isMobileFriendly || false,
              hasEcommerce: html?.hasEcommerce || false,
              hasBooking: html?.hasBooking || false,
              hasCrm: html?.hasCrm || false,
              hasModernDesign: html?.hasModernDesign || false,
              issuesJson: JSON.stringify(scoreResult.issues),
              suggestedService: scoreResult.suggestedService,
              aiDiagnosis: aiDiagnosisJson,
              aiScore,
              aiTokensUsed: aiTokens,
            },
          });

          const finalScore = aiScore !== null ? Math.round(scoreResult.score * 0.4 + aiScore * 0.6) : scoreResult.score;
          await prisma.lead.update({
            where: { id: lead.id },
            data: { score: finalScore, status: "analyzed", email: leadEmail || lead.email },
          });

          if (!diagnosis && !html?.extractedText) {
            await prisma.activityLog.create({
              data: {
                leadId: lead.id,
                campaignId: lead.campaignId,
                type: "analyze",
                message: `🧾 Analisi tecnica completata per ${lead.companyName}`,
              },
            });
          }

          results.analyzed++;
        } catch (error: unknown) {
          const errMsg = error instanceof Error ? error.message : String(error);
          results.errors.push(`Analyze ${lead.companyName}: ${errMsg}`);
        }
      }
    }

    const generationWhere = {
      status: "analyzed",
      messages: { none: {} },
      ...(hasCampaignFilter ? { campaignId: { in: targetCampaignIds } } : {}),
    };

    while (true) {
      const analyzedLeads = await prisma.lead.findMany({
        where: generationWhere,
        include: { analyses: { orderBy: { analyzedAt: "desc" }, take: 1 } },
        orderBy: { updatedAt: "asc" },
        take: WORKER_BATCH_SIZE,
      });

      if (analyzedLeads.length === 0) break;

      for (const lead of analyzedLeads) {
      try {
        const analysis = lead.analyses[0];
        if (!analysis) continue;

        const leadEmail = await enrichLeadEmail(lead);
        await enrichLeadPhone(lead);

        let aiDiag: SiteDiagnosis | null = null;
        if (analysis.aiDiagnosis) {
          try {
            aiDiag = JSON.parse(analysis.aiDiagnosis) as SiteDiagnosis;
          } catch {
            // ignore invalid JSON
          }
        }

        const { problem, service } = mapIssuesToProblemString({
          performanceScore: analysis.performanceScore,
          hasEcommerce: analysis.hasEcommerce,
          hasBooking: analysis.hasBooking,
          isMobileFriendly: analysis.isMobileFriendly,
          hasModernDesign: analysis.hasModernDesign,
          hasCrm: analysis.hasCrm,
          sector: lead.sector,
          aiDiagnosis: aiDiag,
        });

        let qualification: LeadQualification = {
          priority: lead.score >= 75 ? "alta" : lead.score >= 45 ? "media" : "bassa",
          reason: "Decisione AI non disponibile; lead lasciato in revisione manuale",
          bestTiming: "dopo check manuale",
          suggestedChannel: lead.email ? "email" : lead.phone ? "whatsapp" : "telefono",
          recommendedAction: "review_manually",
        };

        if (aiDiag) {
          try {
            const qualResult = await qualifyLeadWithAI({
              companyName: lead.companyName,
              sector: lead.sector,
              score: lead.score,
              diagnosis: aiDiag,
            });
            qualification = qualResult.data;
            results.totalTokens += qualResult.tokensUsed;

            await prisma.activityLog.create({
              data: {
                leadId: lead.id,
                campaignId: lead.campaignId,
                type: "ai_qualify",
                message: `📊 Analisi clienti AI ${lead.companyName}: ${qualification.recommendedAction} (${qualification.suggestedChannel})`,
                metadata: JSON.stringify({
                  priority: qualification.priority,
                  reason: qualification.reason,
                  bestTiming: qualification.bestTiming,
                  suggestedChannel: qualification.suggestedChannel,
                  recommendedAction: qualification.recommendedAction,
                  score: lead.score,
                }),
              },
            });
          } catch {
            // fallback manual review
          }
        }

        if (qualification.recommendedAction === "do_not_contact") {
          await prisma.lead.update({
            where: { id: lead.id },
            data: { status: "rejected" },
          });

          await prisma.activityLog.create({
            data: {
              leadId: lead.id,
              campaignId: lead.campaignId,
              type: "ai_generate",
              message: `⛔ Lead scartato dall'AI: ${lead.companyName}`,
              metadata: JSON.stringify({
                reason: qualification.reason,
                suggestedChannel: qualification.suggestedChannel,
                recommendedAction: qualification.recommendedAction,
              }),
            },
          });

          results.rejected++;
          continue;
        }

        const emailResult = await generateColdEmail({
          companyName: lead.companyName,
          contactName: lead.contactName,
          sector: lead.sector,
          problem,
          suggestedService: analysis.suggestedService || service,
          aiDiagnosis: aiDiag,
        });
        results.totalTokens += emailResult.tokensUsed;

        let whatsappText: string | null = null;
        try {
          const waResult = await generateWhatsAppMessage({
            companyName: lead.companyName,
            sector: lead.sector,
            problem,
            suggestedService: analysis.suggestedService || service,
            personalizedHook: aiDiag?.personalizedHook ?? null,
          });
          whatsappText = waResult.data;
          results.totalTokens += waResult.tokensUsed;
        } catch {
          // optional channel
        }

        const messageType = leadEmail || lead.email ? "email" : lead.phone ? "whatsapp" : "email";
        const readyForEmailSend = Boolean(
          (leadEmail || lead.email) &&
          qualification.recommendedAction === "send_now" &&
          qualification.suggestedChannel === "email"
        );
        const readyForWhatsAppSend = Boolean(
          !readyForEmailSend &&
          messageType === "whatsapp" &&
          lead.phone &&
          qualification.recommendedAction === "send_now"
        );

        const message = await prisma.message.create({
          data: {
            leadId: lead.id,
            type: messageType,
            subject: emailResult.data.subject,
            content: emailResult.data.body,
            whatsappContent: whatsappText,
            status: readyForEmailSend || readyForWhatsAppSend ? "approved" : "draft",
          },
        });

        await prisma.activityLog.create({
          data: {
            leadId: lead.id,
            campaignId: lead.campaignId,
            type: "ai_generate",
            message: readyForEmailSend
              ? `✉️ Testi generati e approvati per invio: ${lead.companyName}`
              : `✉️ Testi generati per revisione manuale: ${lead.companyName}`,
            metadata: JSON.stringify({
              messageId: message.id,
              tokensUsed: emailResult.tokensUsed,
              recommendedAction: qualification.recommendedAction,
              suggestedChannel: qualification.suggestedChannel,
              readyForEmailSend,
              reason: qualification.reason,
            }),
          },
        });

        if (readyForEmailSend) {
          results.readyToSend++;
        } else {
          results.manualReview++;
        }
        results.generated++;
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        results.errors.push(`Generate ${lead.companyName}: ${errMsg}`);
      }
    }
    }

    if (!suppressTelegramSummary) {
      try {
        await notifyDailySummary({
          newLeads: results.scraped,
          analyzed: results.analyzed,
          messagesGenerated: results.generated,
          messagesSent: 0,
          errors: results.errors,
          campaignsProcessed: results.campaignsProcessed,
        });
      } catch {
        // Telegram is optional
      }
    }

    return results;
  } finally {
    clearPromptCache();
  }
}

export async function runSendMailWorker(input: MorningWorkerInput = {}): Promise<MorningWorkerResult> {
  const sendAll = input.sendAll === true;
  const suppressTelegramSummary = input.suppressTelegramSummary === true;

  const settingsRows = await prisma.setting.findMany({
    where: { key: { in: ["auto_send_enabled", "max_emails_per_day", "email_from", "max_whatsapp_per_day"] } },
  });
  const settings = Object.fromEntries(settingsRows.map((row) => [row.key, row.value]));

  const autoSendEnabled = settings.auto_send_enabled !== "false";
  if (!autoSendEnabled && !input.forceRun && !sendAll) {
    return { sent: 0, failed: 0, errors: [], cap: parseInt(settings.max_emails_per_day || "100", 10), sentTodayBefore: 0, sendAll, processed: 0, skipped: true, reason: "auto_send_enabled is false — add ?force=true to override" };
  }

  const maxPerDay = parseInt(settings.max_emails_per_day || "100", 10);
  const maxWhatsAppPerDay = parseInt(settings.max_whatsapp_per_day || "100", 10);
  const emailFrom = settings.email_from || process.env.EMAIL_FROM || "noreply@bitora.it";

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const sentToday = await prisma.message.count({
    where: { status: "sent", sentAt: { gte: todayStart } },
  });

  if (!sendAll && sentToday >= maxPerDay) {
    return {
      sent: 0,
      failed: 0,
      errors: [],
      cap: maxPerDay,
      sentTodayBefore: sentToday,
      sendAll,
      processed: 0,
      skipped: true,
      reason: `Daily cap reached (${sentToday}/${maxPerDay})`,
    };
  }

  const remaining = sendAll ? undefined : maxPerDay - sentToday;

  const candidates = await prisma.message.findMany({
    where: {
      status: "approved",
      type: "email",
      lead: {
        email: { not: null },
        status: { not: "rejected" },
      },
    },
    include: { lead: true },
    ...(typeof remaining === "number" ? { take: remaining } : {}),
    orderBy: { createdAt: "asc" },
  });

  const stats: MorningWorkerResult = {
    sent: 0,
    failed: 0,
    errors: [],
    cap: maxPerDay,
    sentTodayBefore: sentToday,
    sendAll,
    processed: candidates.length,
  };

  for (const message of candidates) {
    if (!message.lead.email) continue;

    const result = await sendEmail({
      to: message.lead.email,
      subject: message.subject || "Una proposta per voi",
      body: message.content,
      from: emailFrom,
    });

    if (result.success) {
      await prisma.message.update({
        where: { id: message.id },
        data: { status: "sent", sentAt: new Date() },
      });
      await prisma.lead.update({
        where: { id: message.lead.id },
        data: { status: "contacted", dealStage: "contacted", lastContactedAt: new Date() },
      });
      await prisma.activityLog.create({
        data: {
          leadId: message.lead.id,
          campaignId: message.lead.campaignId,
          type: "send",
          message: `📧 Invio mail completato: ${message.lead.companyName} <${message.lead.email}>`,
          metadata: JSON.stringify({ messageId: message.id, score: message.lead.score }),
        },
      });
      stats.sent++;
    } else {
      await prisma.message.update({
        where: { id: message.id },
        data: { status: "failed" },
      });
      await prisma.activityLog.create({
        data: {
          leadId: message.lead.id,
          type: "send",
          message: `❌ Invio mail fallito per ${message.lead.companyName}: ${result.error}`,
        },
      });
      stats.failed++;
      stats.errors.push(`${message.lead.companyName}: ${result.error}`);
    }
  }

  // ── WhatsApp send pass ──
  // Send approved WhatsApp messages (via Cloud API or Telegram fallback)
  // Rate limit: respect max_whatsapp_per_day setting (default 50, Meta limit 250)
  const todayStartWa = new Date();
  todayStartWa.setHours(0, 0, 0, 0);
  const waSentToday = await prisma.activityLog.count({
    where: {
      type: "send",
      message: { startsWith: "📱" },
      createdAt: { gte: todayStartWa },
    },
  });
  const waLimit = sendAll ? Infinity : maxWhatsAppPerDay - waSentToday;
  const waRemaining = sendAll ? undefined : Math.min(Math.max(0, waLimit), Math.max(0, maxPerDay - sentToday - stats.sent));
  if (waRemaining === undefined || waRemaining > 0) {
    const waCandidates = await prisma.message.findMany({
      where: {
        status: "approved",
        type: "whatsapp",
        lead: {
          phone: { not: null },
          status: { not: "rejected" },
        },
      },
      include: { lead: true },
      ...(typeof waRemaining === "number" ? { take: waRemaining } : {}),
      orderBy: { createdAt: "asc" },
    });

    for (const message of waCandidates) {
      if (!message.lead.phone) continue;
      const waContent = message.whatsappContent || message.content;

      if (isWhatsAppConfigured()) {
        const waResult = await sendWhatsAppTemplate(message.lead.phone, {
          contactName: message.lead.contactName || message.lead.companyName,
          serviceHook: waContent.substring(0, 120),
        });

        if (waResult.success) {
          await prisma.message.update({
            where: { id: message.id },
            data: { status: "sent", sentAt: new Date() },
          });
          await prisma.lead.update({
            where: { id: message.lead.id },
            data: { status: "contacted", dealStage: "contacted", lastContactedAt: new Date() },
          });
          await prisma.activityLog.create({
            data: {
              leadId: message.lead.id,
              campaignId: message.lead.campaignId,
              type: "send",
              message: `📱 WhatsApp inviato: ${message.lead.companyName} (${waResult.recipientPhone})`,
              metadata: JSON.stringify({ messageId: message.id, waMessageId: waResult.messageId }),
            },
          });
          stats.sent++;
          continue;
        }

        // WhatsApp API failed — log and fall through to Telegram
        await prisma.activityLog.create({
          data: {
            leadId: message.lead.id,
            campaignId: message.lead.campaignId,
            type: "send",
            message: `⚠️ WhatsApp API fallito per ${message.lead.companyName}: ${waResult.error}`,
          },
        });
      }

      // Fallback: send precompiled WhatsApp link via Telegram
      try {
        const phone = message.lead.phone.replace(/\D/g, "");
        const waLink = `https://wa.me/39${phone}?text=${encodeURIComponent(waContent)}`;
        await sendTelegramMessage(
          `📱 <b>WhatsApp da inviare</b>\n\n🏢 <b>${message.lead.companyName}</b>\n📞 ${message.lead.phone}\n\n📄 <i>${waContent.substring(0, 250)}...</i>`,
          [[{ text: "📱 Invia su WhatsApp", url: waLink }]]
        );
        // Mark as sent (via Telegram link)
        await prisma.message.update({
          where: { id: message.id },
          data: { status: "sent", sentAt: new Date() },
        });
        await prisma.lead.update({
          where: { id: message.lead.id },
          data: { status: "contacted", dealStage: "contacted", lastContactedAt: new Date() },
        });
        stats.sent++;
      } catch {
        stats.failed++;
        stats.errors.push(`${message.lead.companyName}: Telegram fallback failed`);
      }
    }
  }

  if (!suppressTelegramSummary) {
    try {
      await notifyDailySummary({
        newLeads: 0,
        analyzed: 0,
        messagesGenerated: 0,
        messagesSent: stats.sent,
        errors: stats.errors,
      });
    } catch {
      // Telegram is optional
    }
  }

  return stats;
}

export async function runLeadBackfillWorker(): Promise<BackfillWorkerResult> {
  await loadPrompts();

  const results: BackfillWorkerResult = {
    pendingBefore: 0,
    pendingAfter: 0,
    emailEnriched: 0,
    analyzed: 0,
    diagnosed: 0,
    generated: 0,
    readyToSend: 0,
    manualReview: 0,
    rejected: 0,
    messagesSent: 0,
    sendFailed: 0,
    totalTokens: 0,
    errors: [],
  };

  const backlogWhere = {
    OR: [
      { analyses: { none: {} } },
      { status: "analyzed", messages: { none: {} } },
      { status: "new" },
    ],
  };

  try {
    results.pendingBefore = await prisma.lead.count({ where: backlogWhere });

    await prisma.activityLog.create({
      data: {
        type: "backfill_start",
        message: `🧹 Backfill avviato: ${results.pendingBefore} lead in arretrato da processare`,
      },
    });

    while (true) {
      const pendingLeads = await prisma.lead.findMany({
        where: { analyses: { none: {} } },
        orderBy: { createdAt: "asc" },
        take: WORKER_BATCH_SIZE,
      });

      if (pendingLeads.length === 0) break;

      for (const lead of pendingLeads) {
        try {
          const previousEmail = lead.email;
          const leadEmail = await enrichLeadEmail(lead);
          await enrichLeadPhone(lead);
          if (!previousEmail && leadEmail) {
            results.emailEnriched++;
          }

          if (!lead.website) {
            await prisma.analysis.create({
              data: {
                leadId: lead.id,
                performanceScore: null,
                lcp: null,
                fid: null,
                cls: null,
                isMobileFriendly: false,
                hasEcommerce: false,
                hasBooking: false,
                hasCrm: false,
                hasModernDesign: false,
                issuesJson: JSON.stringify(["Nessun sito web disponibile per l'analisi automatica"]),
                suggestedService: "Sito vetrina o landing page professionale",
                aiDiagnosis: null,
                aiScore: null,
                aiTokensUsed: 0,
              },
            });

            await prisma.lead.update({
              where: { id: lead.id },
              data: { score: leadEmail ? 35 : 20, status: "analyzed", email: leadEmail || lead.email },
            });

            await prisma.activityLog.create({
              data: {
                leadId: lead.id,
                campaignId: lead.campaignId,
                type: "backfill_progress",
                message: `🧾 Backfill: analisi ridotta completata per ${lead.companyName}`,
              },
            });

            results.analyzed++;
            continue;
          }

          const fullUrl = lead.website.startsWith("http") ? lead.website : `https://${lead.website}`;

          const [pageSpeed, htmlResult] = await Promise.allSettled([
            analyzePageSpeed(fullUrl),
            analyzeHtml(fullUrl),
          ]);

          const ps = pageSpeed.status === "fulfilled" ? pageSpeed.value : null;
          const html = htmlResult.status === "fulfilled" ? htmlResult.value : null;
          const scoreResult = calculateScore(ps, html);

          let aiDiagnosisJson: string | null = null;
          let aiScore: number | null = null;
          let aiTokens = 0;
          let diagnosis: SiteDiagnosis | null = null;

          if (html?.extractedText) {
            try {
              const diagResult = await diagnoseSiteWithAI({
                companyName: lead.companyName,
                sector: lead.sector,
                website: lead.website,
                pageTitle: html.pageTitle,
                metaDescription: html.metaDescription,
                extractedText: html.extractedText,
                performanceScore: ps?.performanceScore ?? null,
                hasEcommerce: html.hasEcommerce,
                hasBooking: html.hasBooking,
                isMobileFriendly: html.isMobileFriendly,
                hasModernDesign: html.hasModernDesign,
                hasCrm: html.hasCrm,
                hasAnalytics: html.hasAnalytics,
                hasSocialPresence: html.hasSocialPresence,
                hasWhatsappWidget: html.hasWhatsappWidget,
                hasContactForm: html.hasContactForm,
                detectedTechs: html.detectedTechs,
              });

              aiDiagnosisJson = JSON.stringify(diagResult.data);
              aiScore = diagResult.data.aiScore;
              diagnosis = diagResult.data;
              aiTokens = diagResult.tokensUsed;
              results.totalTokens += diagResult.tokensUsed;
              results.diagnosed++;

              await prisma.activityLog.create({
                data: {
                  leadId: lead.id,
                  campaignId: lead.campaignId,
                  type: "ai_analysis",
                  message: `🧠 Backfill diagnosi AI ${lead.companyName}: score ${aiScore}/100`,
                  metadata: JSON.stringify({
                    tokensUsed: diagResult.tokensUsed,
                    durationMs: diagResult.durationMs,
                    confidence: diagResult.data.confidence,
                  }),
                },
              });
            } catch {
              // fallback to technical analysis only
            }
          }

          await prisma.analysis.create({
            data: {
              leadId: lead.id,
              performanceScore: ps?.performanceScore || null,
              lcp: ps?.lcp || null,
              fid: ps?.fid || null,
              cls: ps?.cls || null,
              isMobileFriendly: html?.isMobileFriendly || false,
              hasEcommerce: html?.hasEcommerce || false,
              hasBooking: html?.hasBooking || false,
              hasCrm: html?.hasCrm || false,
              hasModernDesign: html?.hasModernDesign || false,
              issuesJson: JSON.stringify(scoreResult.issues),
              suggestedService: scoreResult.suggestedService,
              aiDiagnosis: aiDiagnosisJson,
              aiScore,
              aiTokensUsed: aiTokens,
            },
          });

          const finalScore = aiScore !== null ? Math.round(scoreResult.score * 0.4 + aiScore * 0.6) : scoreResult.score;
          await prisma.lead.update({
            where: { id: lead.id },
            data: { score: finalScore, status: "analyzed", email: leadEmail || lead.email },
          });

          if (!diagnosis && !html?.extractedText) {
            await prisma.activityLog.create({
              data: {
                leadId: lead.id,
                campaignId: lead.campaignId,
                type: "backfill_progress",
                message: `🧾 Backfill tecnico completato per ${lead.companyName}`,
              },
            });
          }

          results.analyzed++;
        } catch (error: unknown) {
          const errMsg = error instanceof Error ? error.message : String(error);
          results.errors.push(`Backfill analyze ${lead.companyName}: ${errMsg}`);
        }
      }
    }

    while (true) {
      const analyzedLeads = await prisma.lead.findMany({
        where: {
          status: "analyzed",
          messages: { none: {} },
        },
        include: { analyses: { orderBy: { analyzedAt: "desc" }, take: 1 } },
        orderBy: { updatedAt: "asc" },
        take: WORKER_BATCH_SIZE,
      });

      if (analyzedLeads.length === 0) break;

      for (const lead of analyzedLeads) {
        try {
          const analysis = lead.analyses[0];
          if (!analysis) continue;

          const previousEmail = lead.email;
          const leadEmail = await enrichLeadEmail(lead);
          await enrichLeadPhone(lead);
          if (!previousEmail && leadEmail) {
            results.emailEnriched++;
          }

          let aiDiag: SiteDiagnosis | null = null;
          if (analysis.aiDiagnosis) {
            try {
              aiDiag = JSON.parse(analysis.aiDiagnosis) as SiteDiagnosis;
            } catch {
              // ignore invalid JSON
            }
          }

          const { problem, service } = mapIssuesToProblemString({
            performanceScore: analysis.performanceScore,
            hasEcommerce: analysis.hasEcommerce,
            hasBooking: analysis.hasBooking,
            isMobileFriendly: analysis.isMobileFriendly,
            hasModernDesign: analysis.hasModernDesign,
            hasCrm: analysis.hasCrm,
            sector: lead.sector,
            aiDiagnosis: aiDiag,
          });

          let qualification: LeadQualification = {
            priority: lead.score >= 75 ? "alta" : lead.score >= 45 ? "media" : "bassa",
            reason: "Decisione AI non disponibile; lead lasciato in revisione manuale",
            bestTiming: "dopo check manuale",
            suggestedChannel: leadEmail || lead.email ? "email" : lead.phone ? "whatsapp" : "telefono",
            recommendedAction: "review_manually",
          };

          if (aiDiag) {
            try {
              const qualResult = await qualifyLeadWithAI({
                companyName: lead.companyName,
                sector: lead.sector,
                score: lead.score,
                diagnosis: aiDiag,
              });
              qualification = qualResult.data;
              results.totalTokens += qualResult.tokensUsed;

              await prisma.activityLog.create({
                data: {
                  leadId: lead.id,
                  campaignId: lead.campaignId,
                  type: "ai_qualify",
                  message: `📊 Backfill qualifica AI ${lead.companyName}: ${qualification.recommendedAction}`,
                  metadata: JSON.stringify({
                    priority: qualification.priority,
                    reason: qualification.reason,
                    bestTiming: qualification.bestTiming,
                    suggestedChannel: qualification.suggestedChannel,
                    recommendedAction: qualification.recommendedAction,
                    score: lead.score,
                  }),
                },
              });
            } catch {
              // fallback manual review
            }
          }

          if (qualification.recommendedAction === "do_not_contact") {
            await prisma.lead.update({
              where: { id: lead.id },
              data: { status: "rejected" },
            });

            results.rejected++;
            continue;
          }

          const emailResult = await generateColdEmail({
            companyName: lead.companyName,
            contactName: lead.contactName,
            sector: lead.sector,
            problem,
            suggestedService: analysis.suggestedService || service,
            aiDiagnosis: aiDiag,
          });
          results.totalTokens += emailResult.tokensUsed;

          let whatsappText: string | null = null;
          try {
            const waResult = await generateWhatsAppMessage({
              companyName: lead.companyName,
              sector: lead.sector,
              problem,
              suggestedService: analysis.suggestedService || service,
              personalizedHook: aiDiag?.personalizedHook ?? null,
            });
            whatsappText = waResult.data;
            results.totalTokens += waResult.tokensUsed;
          } catch {
            // optional channel
          }

          const hasEmail = Boolean(leadEmail || lead.email);
          const messageType = hasEmail ? "email" : lead.phone ? "whatsapp" : "email";
          const readyForEmailSend = Boolean(
            hasEmail &&
            qualification.recommendedAction === "send_now" &&
            qualification.suggestedChannel === "email"
          );
          const readyForWhatsAppSend = Boolean(
            !readyForEmailSend &&
            messageType === "whatsapp" &&
            lead.phone &&
            qualification.recommendedAction === "send_now"
          );

          await prisma.message.create({
            data: {
              leadId: lead.id,
              type: messageType,
              subject: emailResult.data.subject,
              content: emailResult.data.body,
              whatsappContent: whatsappText,
              status: readyForEmailSend || readyForWhatsAppSend ? "approved" : "draft",
            },
          });

          if (readyForEmailSend || readyForWhatsAppSend) {
            results.readyToSend++;
          } else {
            results.manualReview++;
          }
          results.generated++;
        } catch (error: unknown) {
          const errMsg = error instanceof Error ? error.message : String(error);
          results.errors.push(`Backfill generate ${lead.companyName}: ${errMsg}`);
        }
      }
    }

    const sendResults = await runSendMailWorker({
      forceRun: true,
      sendAll: true,
      suppressTelegramSummary: true,
    });

    results.messagesSent = sendResults.sent;
    results.sendFailed = sendResults.failed;
    results.errors.push(...sendResults.errors.map((error) => `Backfill send ${error}`));
    results.pendingAfter = await prisma.lead.count({ where: backlogWhere });

    await prisma.activityLog.create({
      data: {
        type: "backfill_done",
        message: `✅ Backfill completato: ${results.analyzed} lead analizzati, ${results.generated} messaggi generati, ${results.messagesSent} email inviate`,
        metadata: JSON.stringify({
          pendingBefore: results.pendingBefore,
          pendingAfter: results.pendingAfter,
          emailEnriched: results.emailEnriched,
          readyToSend: results.readyToSend,
          manualReview: results.manualReview,
          rejected: results.rejected,
          sendFailed: results.sendFailed,
          totalTokens: results.totalTokens,
          errors: results.errors.length,
        }),
      },
    });

    return results;
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    results.errors.push(errMsg);

    await prisma.activityLog.create({
      data: {
        type: "backfill_error",
        message: `❌ Backfill fallito: ${errMsg}`,
      },
    });

    return results;
  } finally {
    clearPromptCache();
  }
}

// ─── Follow-up Worker ──────────────────────────────────────────────────
// Sends automated follow-ups to contacted leads that haven't replied.
// Anti-spam: max 2 follow-ups per lead ever (1 after 3 days, 1 after 7 days).
export type FollowUpWorkerResult = {
  followUpsSent: number;
  followUpsFailed: number;
  errors: string[];
  totalTokens: number;
};

export async function runFollowUpWorker(): Promise<FollowUpWorkerResult> {
  const results: FollowUpWorkerResult = {
    followUpsSent: 0,
    followUpsFailed: 0,
    errors: [],
    totalTokens: 0,
  };

  const settingsRows = await prisma.setting.findMany({
    where: { key: { in: ["max_whatsapp_per_day", "max_emails_per_day", "email_from"] } },
  });
  const settings = Object.fromEntries(settingsRows.map((row) => [row.key, row.value]));
  const maxWhatsAppPerDay = parseInt(settings.max_whatsapp_per_day || "100", 10);
  const maxEmailsPerDay = parseInt(settings.max_emails_per_day || "100", 10);
  const emailFrom = settings.email_from || process.env.EMAIL_FROM || "noreply@bitora.it";

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Check daily limits
  const emailsSentToday = await prisma.message.count({
    where: { status: "sent", type: "email", sentAt: { gte: todayStart } },
  });
  const waSentToday = await prisma.activityLog.count({
    where: { type: "send", message: { startsWith: "📱" }, createdAt: { gte: todayStart } },
  });

  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Find leads eligible for follow-up:
  // - status "contacted" (no reply yet)
  // - dealStage "contacted"
  // - lastContactedAt > 3 days ago for first follow-up, > 7 days for second
  // - followUpCount < 2
  const eligibleLeads = await prisma.lead.findMany({
    where: {
      status: "contacted",
      dealStage: "contacted",
      followUpCount: { lt: 2 },
      lastContactedAt: { not: null, lte: threeDaysAgo },
    },
    include: {
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    take: 20,
    orderBy: { lastContactedAt: "asc" },
  });

  for (const lead of eligibleLeads) {
    // Follow-up #2 requires 7 days since last contact
    if (lead.followUpCount === 1 && lead.lastContactedAt && lead.lastContactedAt > sevenDaysAgo) {
      continue;
    }

    const originalMessage = lead.messages[0];
    if (!originalMessage) continue;

    const followUpNumber = lead.followUpCount + 1;
    const channel = lead.email ? "email" : lead.phone ? "whatsapp" : null;
    if (!channel) continue;

    // Check rate limits
    if (channel === "email" && emailsSentToday + results.followUpsSent >= maxEmailsPerDay) continue;
    if (channel === "whatsapp" && waSentToday + results.followUpsSent >= maxWhatsAppPerDay) continue;

    try {
      const followUp = await generateFollowUpMessage({
        companyName: lead.companyName,
        contactName: lead.contactName,
        sector: lead.sector,
        originalMessage: originalMessage.content,
        followUpNumber,
        channel,
      });
      results.totalTokens += followUp.tokensUsed;

      let sent = false;

      if (channel === "email" && lead.email) {
        const emailResult = await sendEmail({
          to: lead.email,
          subject: followUp.data.subject || "Seguito alla mia proposta",
          body: followUp.data.body,
          from: emailFrom,
        });
        sent = emailResult.success;
        if (!sent) results.errors.push(`Follow-up email ${lead.companyName}: ${emailResult.error}`);
      } else if (channel === "whatsapp" && lead.phone) {
        if (isWhatsAppConfigured()) {
          const waResult = await sendWhatsAppText(lead.phone, followUp.data.body);
          sent = waResult.success;
          if (!sent) results.errors.push(`Follow-up WA ${lead.companyName}: ${waResult.error}`);
        }
      }

      if (sent) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            followUpCount: followUpNumber,
            lastContactedAt: new Date(),
            nextFollowUp: followUpNumber < 2 ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) : null,
          },
        });

        await prisma.activityLog.create({
          data: {
            leadId: lead.id,
            campaignId: lead.campaignId,
            type: "send",
            message: `🔄 Follow-up #${followUpNumber} ${channel === "email" ? "📧" : "📱"} inviato a ${lead.companyName}`,
            metadata: JSON.stringify({ followUpNumber, channel, tokensUsed: followUp.tokensUsed }),
          },
        });

        results.followUpsSent++;
      } else {
        results.followUpsFailed++;
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      results.errors.push(`Follow-up ${lead.companyName}: ${errMsg}`);
      results.followUpsFailed++;
    }
  }

  return results;
}