import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page, type Request } from "@playwright/test";
import type { AuditOptions, AuditResult, Finding, RouteProofConfig, RouteResult } from "./types.js";
import { discoverSitemapRoutes } from "./sitemap.js";
import { matchesAny, normalizeUrl, routeOf } from "./url.js";

interface QueueItem {
  url: string;
  depth: number;
  discoveryMethod: RouteResult["discoveryMethod"];
  discoveredFrom?: string;
}

interface NetworkFailure {
  url: string;
  method: string;
  status?: number;
  reason?: string;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function safeFilename(route: string): string {
  const cleaned = route.replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  return cleaned || "home";
}

async function capture(page: Page, outputDir: string, route: string): Promise<string | undefined> {
  try {
    const relative = `screenshots/${safeFilename(route)}.png`;
    await mkdir(resolve(outputDir, "screenshots"), { recursive: true });
    await page.screenshot({ path: resolve(outputDir, relative), fullPage: true });
    return relative;
  } catch {
    return undefined;
  }
}

function shouldIgnoreNetwork(url: string, config: RouteProofConfig): boolean {
  return matchesAny(url, config.ignoreNetworkErrors);
}

function formatNetworkFailures(failures: NetworkFailure[]): string {
  return failures.slice(0, 20).map((failure) =>
    `${failure.method} ${failure.url} → ${failure.status ?? failure.reason}`,
  ).join("\n");
}

function runtimeFindings(
  route: string,
  config: RouteProofConfig,
  consoleMessages: string[],
  uncaughtErrors: string[],
  networkFailures: NetworkFailure[],
): Finding[] {
  const visibleConsole = config.consoleErrors ? consoleMessages : [];
  const visiblePageErrors = config.pageErrors ? uncaughtErrors : [];
  const hasCorrelatedIncident = networkFailures.length > 0
    && (visibleConsole.length > 0 || visiblePageErrors.length > 0);

  if (hasCorrelatedIncident) {
    const sections = [
      `NETWORK (${networkFailures.length})\n${formatNetworkFailures(networkFailures)}`,
      visiblePageErrors.length
        ? `UNCAUGHT JAVASCRIPT (${visiblePageErrors.length})\n${visiblePageErrors.slice(0, 10).join("\n\n")}`
        : undefined,
      visibleConsole.length
        ? `CONSOLE (${visibleConsole.length})\n${visibleConsole.slice(0, 10).join("\n")}`
        : undefined,
    ].filter((section): section is string => Boolean(section));

    return [{
      code: "RUNTIME_INCIDENT",
      severity: visiblePageErrors.length || networkFailures.some((failure) => failure.status === undefined || failure.status >= 500)
        ? "error"
        : "warning",
      route,
      message: `Correlated runtime incident: ${networkFailures.length} API failure(s), ${visiblePageErrors.length} uncaught error(s), ${visibleConsole.length} console error(s)`,
      detail: sections.join("\n\n"),
    }];
  }

  const findings: Finding[] = [];
  if (visibleConsole.length) findings.push({ code: "CONSOLE_ERROR", severity: "warning", route, message: `${visibleConsole.length} console error(s)`, detail: visibleConsole.slice(0, 10).join("\n") });
  if (visiblePageErrors.length) findings.push({ code: "PAGE_ERROR", severity: "error", route, message: `${visiblePageErrors.length} uncaught JavaScript error(s)`, detail: visiblePageErrors.slice(0, 10).join("\n\n") });
  if (networkFailures.length) {
    const serverFailures = networkFailures.filter((failure) => failure.status === undefined || failure.status >= 500);
    findings.push({
      code: serverFailures.length ? "REQUEST_FAILED" : "NETWORK_ERROR",
      severity: serverFailures.length ? "error" : "warning",
      route,
      message: `${networkFailures.length} API request(s) failed`,
      detail: formatNetworkFailures(networkFailures),
    });
  }
  return findings;
}

async function detectSoft404(page: Page, config: RouteProofConfig): Promise<string | undefined> {
  for (const selector of config.soft404.selectors) {
    const visible = await page.locator(selector).first().isVisible().catch(() => false);
    if (visible) return `Visible not-found selector: ${selector}`;
  }

  const headings = await page.locator("h1, h2, [role='heading']").allTextContents().catch(() => [] as string[]);
  const normalizedHeadings = headings.map((heading) => heading.trim().toLowerCase());
  for (const text of config.soft404.texts) {
    const normalizedText = text.trim().toLowerCase();
    if (normalizedHeadings.some((heading) => heading === normalizedText)) {
      return `Not-found heading detected: ${text}`;
    }
  }
  return undefined;
}

async function authenticate(
  context: BrowserContext,
  config: RouteProofConfig,
  options: AuditOptions,
  baseUrl: string,
): Promise<void> {
  const login = config.auth?.login;
  if (!login) return;

  const username = process.env[login.usernameEnv];
  const password = process.env[login.passwordEnv];
  if (!username || !password) {
    const missing = [!username && login.usernameEnv, !password && login.passwordEnv].filter(Boolean).join(", ");
    throw new Error(`Missing authentication environment variable(s): ${missing}`);
  }

  const loginUrl = new URL(login.url, baseUrl).toString();
  const loginRoute = routeOf(loginUrl);
  options.onProgress?.({ phase: "auth-start", route: loginRoute, scanned: 0, queued: 0, maxRoutes: config.maxRoutes });
  const page = await context.newPage();
  try {
    await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: config.timeoutMs });
    await page.locator(login.usernameSelector).fill(username, { timeout: config.timeoutMs });
    await page.locator(login.passwordSelector).fill(password, { timeout: config.timeoutMs });
    const configuredSubmit = page.locator(login.submitSelector);
    const standardSubmit = page.locator('button[type="submit"], input[type="submit"]');
    const submit = configuredSubmit.or(standardSubmit).first();
    await Promise.all([
      submit.click({ timeout: config.timeoutMs }),
      login.successUrl
        ? page.waitForURL(login.successUrl, { timeout: config.timeoutMs })
        : page.waitForLoadState("networkidle", { timeout: config.timeoutMs }).catch(() => {}),
    ]);
    if (routeOf(page.url()) === loginRoute) {
      throw new Error("Authentication stayed on the login page. Check the credentials and selectors.");
    }
  } catch (error) {
    throw new Error(`Authentication failed at ${loginRoute}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await page.close();
  }
  options.onProgress?.({ phase: "auth-complete", route: routeOf(loginUrl), scanned: 0, queued: 0, maxRoutes: config.maxRoutes });
}

export async function audit(config: RouteProofConfig, options: AuditOptions = {}): Promise<AuditResult> {
  if (!config.baseUrl) throw new Error("A base URL is required.");
  const baseUrl = new URL(config.baseUrl).toString();
  const startedAt = new Date().toISOString();
  const findings: Finding[] = [];
  const routes: RouteResult[] = [];
  const visited = new Set<string>();
  const discovered = new Set<string>();
  const queued = new Set<string>();
  const first = normalizeUrl(baseUrl, baseUrl)!;
  const queue: QueueItem[] = [{ url: first, depth: 0, discoveryMethod: "entry" }];
  queued.add(first);
  for (const seed of config.seedRoutes) {
    const normalized = normalizeUrl(seed, baseUrl);
    if (normalized && !queued.has(normalized)) {
      queue.push({ url: normalized, depth: 0, discoveryMethod: "seed" });
      queued.add(normalized);
    }
  }

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: config.userAgent,
      storageState: config.auth?.storageState,
    });
    await authenticate(context, config, options, baseUrl);
    if (config.sitemaps.length) {
      options.onProgress?.({ phase: "sitemap-start", route: config.sitemaps.join(", "), scanned: 0, queued: queue.length, maxRoutes: config.maxRoutes });
      const sitemapRoutes = await discoverSitemapRoutes(context.request, config, baseUrl);
      for (const sitemapUrl of sitemapRoutes) {
        const sitemapRoute = routeOf(sitemapUrl);
        discovered.add(sitemapUrl);
        if (!queued.has(sitemapUrl) && !matchesAny(sitemapRoute, config.exclude)) {
          queue.push({ url: sitemapUrl, depth: 0, discoveryMethod: "sitemap", discoveredFrom: "/sitemap.xml" });
          queued.add(sitemapUrl);
        }
      }
      options.onProgress?.({ phase: "sitemap-complete", route: config.sitemaps.join(", "), scanned: 0, queued: queue.length, maxRoutes: config.maxRoutes, discovered: sitemapRoutes.length });
    }

    while (queue.length && visited.size < config.maxRoutes) {
      const item = queue.shift()!;
      queued.delete(item.url);
      if (visited.has(item.url)) continue;
      visited.add(item.url);

      const route = routeOf(item.url);
      if (matchesAny(route, config.exclude)) continue;
      options.onProgress?.({
        phase: "start",
        route,
        scanned: routes.length,
        queued: queue.length,
        maxRoutes: config.maxRoutes,
        discoveryMethod: item.discoveryMethod,
        discoveredFrom: item.discoveredFrom,
      });
      const page = await context.newPage();
      const consoleMessages: string[] = [];
      const uncaughtErrors: string[] = [];
      const networkFailures: NetworkFailure[] = [];
      const redirectChain: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleMessages.push(message.text());
      });
      page.on("request", (request: Request) => {
        if (request.isNavigationRequest() && request.redirectedFrom()) redirectChain.push(request.url());
      });
      page.on("pageerror", (error) => uncaughtErrors.push(error.stack ?? error.message));
      page.on("response", (response) => {
        const resourceType = response.request().resourceType();
        if (
          config.networkErrors
          && ["fetch", "xhr"].includes(resourceType)
          && response.status() >= 400
          && !shouldIgnoreNetwork(response.url(), config)
        ) {
          networkFailures.push({
            url: response.url(),
            method: response.request().method(),
            status: response.status(),
          });
        }
      });
      page.on("requestfailed", (request) => {
        if (
          config.networkErrors
          && ["fetch", "xhr"].includes(request.resourceType())
          && !shouldIgnoreNetwork(request.url(), config)
        ) {
          networkFailures.push({
            url: request.url(),
            method: request.method(),
            reason: request.failure()?.errorText ?? "Unknown network failure",
          });
        }
      });

      const start = performance.now();
      let status: number | null = null;
      let finalUrl = item.url;
      let loadError: string | undefined;
      try {
        const response = await page.goto(item.url, { waitUntil: "domcontentloaded", timeout: config.timeoutMs });
        status = response?.status() ?? null;
        finalUrl = page.url();
        await page.waitForLoadState("networkidle", { timeout: Math.min(config.timeoutMs, 3_000) }).catch(() => {});
        if (config.observeMs > 0) await delay(config.observeMs);
      } catch (error) {
        loadError = error instanceof Error ? error.message : String(error);
      }
      const durationMs = Math.round(performance.now() - start);

      const links = loadError ? [] : await page.locator("a[href]").evaluateAll((anchors) =>
        anchors.map((anchor) => (anchor as HTMLAnchorElement).href),
      ).catch(() => [] as string[]);
      const normalizedLinks = [...new Set(links.map((link) => normalizeUrl(link, baseUrl)).filter((link): link is string => Boolean(link)))];
      normalizedLinks.forEach((link) => discovered.add(link));

      const routeFindings: Finding[] = [];
      if (loadError) routeFindings.push({ code: "LOAD_ERROR", severity: "error", route, message: "Page could not be loaded", detail: loadError });
      if (status !== null && status >= 400) routeFindings.push({ code: "HTTP_ERROR", severity: "error", route, message: `HTTP ${status} returned` });
      if (redirectChain.length > 10) routeFindings.push({ code: "REDIRECT_LOOP", severity: "error", route, message: "Possible redirect loop detected", detail: redirectChain.join(" → ") });
      if (new URL(finalUrl).origin !== new URL(baseUrl).origin) routeFindings.push({ code: "CROSS_ORIGIN_REDIRECT", severity: "warning", route, message: "Route redirected to another origin", detail: finalUrl });
      const loginUrl = config.auth?.login ? new URL(config.auth.login.url, baseUrl) : undefined;
      if (loginUrl && route !== routeOf(loginUrl.toString()) && routeOf(finalUrl) === routeOf(loginUrl.toString())) {
        routeFindings.push({ code: "AUTH_REDIRECT", severity: "error", route, message: "Authenticated route redirected to the login page", detail: finalUrl });
      }
      routeFindings.push(...runtimeFindings(route, config, consoleMessages, uncaughtErrors, networkFailures));
      if (!loadError && status !== null && status < 400) {
        const soft404 = await detectSoft404(page, config);
        if (soft404) routeFindings.push({ code: "SOFT_404", severity: "error", route, message: "Page looks like a not-found page despite a successful HTTP status", detail: soft404 });
      }

      if (routeFindings.length && config.screenshotOnError && !loadError) {
        const screenshot = await capture(page, config.outputDir, route);
        routeFindings.forEach((finding) => { finding.screenshot = screenshot; });
      }
      findings.push(...routeFindings);
      routes.push({
        route,
        finalUrl,
        status,
        durationMs,
        links: normalizedLinks.map(routeOf),
        redirectChain,
        networkFailures: networkFailures.length,
        pageErrors: uncaughtErrors.length,
        discoveryMethod: item.discoveryMethod,
        discoveredFrom: item.discoveredFrom,
      });
      await page.close();

      if (item.depth < config.maxDepth) {
        for (const link of normalizedLinks) {
          const linkedRoute = routeOf(link);
          if (!visited.has(link) && !queued.has(link) && !matchesAny(linkedRoute, config.exclude)) {
            queue.push({ url: link, depth: item.depth + 1, discoveryMethod: "link", discoveredFrom: route });
            queued.add(link);
          }
        }
      }

      options.onProgress?.({
        phase: "complete",
        route,
        scanned: routes.length,
        queued: queue.length,
        maxRoutes: config.maxRoutes,
        status,
        durationMs,
        errors: routeFindings.filter((finding) => finding.severity === "error").length,
        warnings: routeFindings.filter((finding) => finding.severity === "warning").length,
      });
      if (queue.length && config.delayMs > 0) await delay(config.delayMs);
    }
  } finally {
    await browser?.close();
  }

  for (const expected of config.expectedRoutes) {
    const normalized = normalizeUrl(expected, baseUrl);
    if (normalized && normalized !== first && !discovered.has(normalized)) {
      findings.push({ code: "UNREACHABLE_ROUTE", severity: "warning", route: routeOf(normalized), message: "Expected route was not reachable through an internal link" });
    }
  }

  const errors = findings.filter((finding) => finding.severity === "error").length;
  const warnings = findings.filter((finding) => finding.severity === "warning").length;
  const unhealthy = new Set(findings.map((finding) => finding.route));
  return {
    baseUrl,
    startedAt,
    finishedAt: new Date().toISOString(),
    routes,
    findings,
    summary: { scanned: routes.length, healthy: routes.filter((route) => !unhealthy.has(route.route)).length, errors, warnings },
  };
}
