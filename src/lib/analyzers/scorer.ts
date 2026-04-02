import type { PageSpeedResult } from "./pagespeed";
import type { HtmlAnalysisResult } from "./html-analyzer";

export interface ScoreResult {
  score: number;
  issues: string[];
  suggestedService: string;
}

export function calculateScore(
  pagespeed: PageSpeedResult | null,
  htmlAnalysis: HtmlAnalysisResult | null
): ScoreResult {
  let score = 0;
  const issues: string[] = [];

  // ── Performance (0–25 pts) ─────────────────────────────────────────────────
  if (pagespeed) {
    if (pagespeed.performanceScore < 30) {
      score += 25;
      issues.push(`Performance critica (${pagespeed.performanceScore}/100 su mobile)`);
    } else if (pagespeed.performanceScore < 50) {
      score += 20;
      issues.push(`Performance molto scarsa (${pagespeed.performanceScore}/100 su mobile)`);
    } else if (pagespeed.performanceScore < 70) {
      score += 12;
      issues.push(`Performance migliorabile (${pagespeed.performanceScore}/100 su mobile)`);
    } else if (pagespeed.performanceScore < 85) {
      score += 5;
    }
    // LCP > 4s is a major flag
    if (pagespeed.lcp > 4000) {
      score += 5;
      issues.push(`Caricamento lento: LCP ${(pagespeed.lcp / 1000).toFixed(1)}s`);
    }
  } else {
    // No PageSpeed result = probably very old or unreachable site
    score += 8;
    issues.push("Performance non rilevabile (sito lento o non raggiungibile)");
  }

  // ── Mobile-friendly (0–20 pts) ────────────────────────────────────────────
  if (htmlAnalysis && !htmlAnalysis.isMobileFriendly) {
    score += 20;
    issues.push("Sito non ottimizzato per mobile (mancanza viewport)");
  }

  // ── E-commerce (0–15 pts) ────────────────────────────────────────────────
  if (htmlAnalysis && !htmlAnalysis.hasEcommerce) {
    score += 15;
    issues.push("Nessun e-commerce rilevato");
  }

  // ── Booking (0–12 pts) ───────────────────────────────────────────────────
  if (htmlAnalysis && !htmlAnalysis.hasBooking) {
    score += 12;
    issues.push("Nessun sistema di prenotazione online");
  }

  // ── Modern design (0–10 pts) ─────────────────────────────────────────────
  if (htmlAnalysis && !htmlAnalysis.hasModernDesign) {
    score += 10;
    issues.push("Tecnologie obsolete rilevate (Bootstrap 2/3, jQuery vecchio)");
  }

  // ── CRM (0–5 pts) ────────────────────────────────────────────────────────
  if (htmlAnalysis && !htmlAnalysis.hasCrm) {
    score += 5;
    issues.push("Nessuna area clienti / gestionale rilevato");
  }

  // ── Analytics bonus (lowers score: they already have some digital maturity) ──
  if (htmlAnalysis?.hasAnalytics) {
    score = Math.max(0, score - 5);
  }

  // Cap at 100
  score = Math.min(score, 100);

  const suggestedService = determineSuggestedService(pagespeed, htmlAnalysis, issues);

  return { score, issues, suggestedService };
}

function determineSuggestedService(
  pagespeed: PageSpeedResult | null,
  htmlAnalysis: HtmlAnalysisResult | null,
  issues: string[]
): string {
  if (pagespeed && pagespeed.performanceScore < 50) {
    return "Rifacimento Sito Web ad alte performance";
  }
  if (htmlAnalysis && !htmlAnalysis.isMobileFriendly) {
    return "Rifacimento Sito Web responsive e mobile-first";
  }
  if (htmlAnalysis && !htmlAnalysis.hasModernDesign) {
    return "Rifacimento Sito Web moderno";
  }
  if (htmlAnalysis && !htmlAnalysis.hasEcommerce) {
    return "E-commerce custom";
  }
  if (htmlAnalysis && !htmlAnalysis.hasBooking) {
    return "Sistema di prenotazione online";
  }
  if (htmlAnalysis && !htmlAnalysis.hasCrm) {
    return "CRM / Gestionale su misura";
  }
  if (issues.length > 0) {
    return "Sito Web ad alte performance";
  }
  return "Consulenza digitale";
}
