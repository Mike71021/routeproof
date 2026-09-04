export function normalizeUrl(input: string, baseUrl: string): string | null {
  try {
    const url = new URL(input, baseUrl);
    const base = new URL(baseUrl);
    if (url.origin !== base.origin) return null;
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    url.searchParams.sort();
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function routeOf(urlString: string): string {
  const url = new URL(urlString);
  return `${url.pathname}${url.search}`;
}

export function matchesAny(route: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern.startsWith("/") && pattern.endsWith("/") && pattern.length > 2) {
      return new RegExp(pattern.slice(1, -1)).test(route);
    }
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
    return new RegExp(`^${escaped}$`).test(route);
  });
}
