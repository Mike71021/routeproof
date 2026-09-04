export type Severity = "error" | "warning";

export type FindingCode =
  | "HTTP_ERROR"
  | "LOAD_ERROR"
  | "REDIRECT_LOOP"
  | "CROSS_ORIGIN_REDIRECT"
  | "BROKEN_DEEP_LINK"
  | "CONSOLE_ERROR"
  | "PAGE_ERROR"
  | "NETWORK_ERROR"
  | "REQUEST_FAILED"
  | "RUNTIME_INCIDENT"
  | "SOFT_404"
  | "AUTH_REDIRECT"
  | "UNREACHABLE_ROUTE";

export interface Finding {
  code: FindingCode;
  severity: Severity;
  route: string;
  message: string;
  detail?: string;
  screenshot?: string;
}

export interface RouteResult {
  route: string;
  finalUrl: string;
  status: number | null;
  durationMs: number;
  links: string[];
  redirectChain: string[];
  networkFailures: number;
  pageErrors: number;
  discoveryMethod: "entry" | "seed" | "sitemap" | "link";
  discoveredFrom?: string;
}

export interface AuditResult {
  baseUrl: string;
  startedAt: string;
  finishedAt: string;
  routes: RouteResult[];
  findings: Finding[];
  summary: {
    healthy: number;
    warnings: number;
    errors: number;
    scanned: number;
  };
}

export interface RouteProofConfig {
  baseUrl?: string;
  maxDepth: number;
  maxRoutes: number;
  timeoutMs: number;
  delayMs: number;
  exclude: string[];
  include: string[];
  expectedRoutes: string[];
  seedRoutes: string[];
  sitemaps: string[];
  outputDir: string;
  screenshotOnError: boolean;
  consoleErrors: boolean;
  pageErrors: boolean;
  networkErrors: boolean;
  ignoreNetworkErrors: string[];
  soft404: {
    selectors: string[];
    texts: string[];
  };
  userAgent?: string;
  auth?: {
    storageState?: string;
    login?: {
      url: string;
      usernameSelector: string;
      passwordSelector: string;
      submitSelector: string;
      usernameEnv: string;
      passwordEnv: string;
      successUrl?: string;
    };
  };
}

export interface AuditProgress {
  phase: "auth-start" | "auth-complete" | "sitemap-start" | "sitemap-complete" | "start" | "complete";
  route: string;
  scanned: number;
  queued: number;
  maxRoutes: number;
  status?: number | null;
  durationMs?: number;
  errors?: number;
  warnings?: number;
  discovered?: number;
  discoveryMethod?: RouteResult["discoveryMethod"];
  discoveredFrom?: string;
}

export interface AuditOptions {
  onProgress?: (progress: AuditProgress) => void;
}
