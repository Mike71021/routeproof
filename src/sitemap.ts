import type { APIRequestContext } from "@playwright/test";
import type { RouteProofConfig } from "./types.js";
import { normalizeUrl } from "./url.js";

function decodeXml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

export function extractSitemapLocations(xml: string): string[] {
  return [...xml.matchAll(/<loc(?:\s[^>]*)?>([\s\S]*?)<\/loc>/gi)]
    .map((match) => decodeXml(match[1]?.trim() ?? ""))
    .filter(Boolean);
}

export async function discoverSitemapRoutes(
  request: APIRequestContext,
  config: RouteProofConfig,
  baseUrl: string,
): Promise<string[]> {
  const pending = config.sitemaps
    .map((sitemap) => normalizeUrl(sitemap, baseUrl))
    .filter((url): url is string => Boolean(url));
  const visitedSitemaps = new Set<string>();
  const routes = new Set<string>();

  while (pending.length && visitedSitemaps.size < 20) {
    const sitemapUrl = pending.shift()!;
    if (visitedSitemaps.has(sitemapUrl)) continue;
    visitedSitemaps.add(sitemapUrl);

    try {
      const response = await request.get(sitemapUrl, { timeout: config.timeoutMs });
      if (!response.ok()) continue;
      const xml = await response.text();
      for (const location of extractSitemapLocations(xml)) {
        const normalized = normalizeUrl(location, baseUrl);
        if (!normalized) continue;
        if (/\.xml(?:\?|$)/i.test(new URL(normalized).pathname) || /<sitemapindex[\s>]/i.test(xml)) {
          if (!visitedSitemaps.has(normalized)) pending.push(normalized);
        } else {
          routes.add(normalized);
        }
      }
    } catch {
      // A missing or unavailable sitemap should not prevent the browser crawl.
    }
  }

  return [...routes];
}
