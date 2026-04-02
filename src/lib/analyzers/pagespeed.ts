export interface PageSpeedResult {
  performanceScore: number;
  lcp: number;
  fid: number;
  cls: number;
}

export async function analyzePageSpeed(url: string): Promise<PageSpeedResult | null> {
  const apiKey = process.env.PAGESPEED_API_KEY;
  const endpoint = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
  
  const targetUrl = url.startsWith("http") ? url : `https://${url}`;
  const params = new URLSearchParams({
    url: targetUrl,
    strategy: "mobile",
    category: "performance",
  });
  if (apiKey) params.set("key", apiKey);

  try {
    const res = await fetch(`${endpoint}?${params}`, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) {
      console.error(`PageSpeed API error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const lighthouse = data.lighthouseResult;
    if (!lighthouse) return null;

    const performanceScore = Math.round((lighthouse.categories?.performance?.score ?? 0) * 100);
    const audits = lighthouse.audits || {};

    return {
      performanceScore,
      lcp: audits["largest-contentful-paint"]?.numericValue ?? 0,
      fid: audits["max-potential-fid"]?.numericValue ?? audits["total-blocking-time"]?.numericValue ?? 0,
      cls: audits["cumulative-layout-shift"]?.numericValue ?? 0,
    };
  } catch (err) {
    console.error("PageSpeed analysis error:", err);
    return null;
  }
}
