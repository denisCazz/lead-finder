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

  // Performance (0-30 points)
  if (pagespeed) {
    if (pagespeed.performanceScore < 30) {
      score += 30;
      issues.push(`Performance critica (${pagespeed.performanceScore}/100)`);
    } else if (pagespeed.performanceScore < 50) {
      score += 25;
      issues.push(`Performance scarsa (${pagespeed.performanceScore}/100)`);
    } else if (pagespeed.performanceScore < 70) {
      score += 15;
      issues.push(`Performance migliorabile (${pagespeed.performanceScore}/100)`);
    } else if (pagespeed.performanceScore < 90) {
      score += 5;
    }
  }

  // E-commerce (0-20 points)
  if (htmlAnalysis && !htmlAnalysis.hasEcommerce) {
    score += 20;
    issues.push("Nessun e-commerce rilevato");
  }

  // Booking (0-15 points)
  if (htmlAnalysis && !htmlAnalysis.hasBooking) {
    score += 15;
    issues.push("Nessun sistema prenotazione online");
  }

  // Mobile (0-20 points)
  if (htmlAnalysis && !htmlAnalysis.isMobileFriendly) {
    score += 20;
    issues.push("Sito non ottimizzato per mobile");
  }

  // Modern design (0-10 points)
  if (htmlAnalysis && !htmlAnalysis.hasModernDesign) {
    score += 10;
    issues.push("Design datato / tecnologie obsolete");
  }

  // CRM (0-5 points)
  if (htmlAnalysis && !htmlAnalysis.hasCrm) {
    score += 5;
    issues.push("Nessuna area clienti / gestionale rilevato");
  }

  // Cap at 100
  score = Math.min(score, 100);

  // Determine primary suggested service
  const suggestedService = determineSuggestedService(pagespeed, htmlAnalysis, issues);

  return { score, issues, suggestedService };
}

function determineSuggestedService(
  pagespeed: PageSpeedResult | null,
  htmlAnalysis: HtmlAnalysisResult | null,
  issues: string[]
): string {
  // Priority order
  if (pagespeed && pagespeed.performanceScore < 50) {
    return "Rifacimento Sito Web ad alte performance";
  }
  if (htmlAnalysis && !htmlAnalysis.isMobileFriendly) {
    return "Rifacimento Sito Web responsive";
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
