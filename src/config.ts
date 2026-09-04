import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createJiti } from "jiti";
import { z } from "zod";
import type { RouteProofConfig } from "./types.js";

const schema = z.object({
  baseUrl: z.string().url().optional(),
  maxDepth: z.number().int().min(0).max(20).default(4),
  maxRoutes: z.number().int().min(1).max(10_000).default(200),
  timeoutMs: z.number().int().min(100).default(15_000),
  delayMs: z.number().int().min(0).max(60_000).default(0),
  observeMs: z.number().int().min(0).max(60_000).default(0),
  exclude: z.array(z.string()).default(["/logout"]),
  include: z.array(z.string()).default([]),
  expectedRoutes: z.array(z.string()).default([]),
  seedRoutes: z.array(z.string()).default([]),
  sitemaps: z.array(z.string()).default(["/sitemap.xml"]),
  outputDir: z.string().default("routeproof-report"),
  screenshotOnError: z.boolean().default(true),
  consoleErrors: z.boolean().default(true),
  pageErrors: z.boolean().default(true),
  networkErrors: z.boolean().default(true),
  ignoreNetworkErrors: z.array(z.string()).default([]),
  soft404: z.object({
    selectors: z.array(z.string()).default([
      "[data-testid='not-found']",
      "[data-routeproof='not-found']",
    ]),
    texts: z.array(z.string()).default(["page not found", "404 not found"]),
  }).default({
    selectors: ["[data-testid='not-found']", "[data-routeproof='not-found']"],
    texts: ["page not found", "404 not found"],
  }),
  userAgent: z.string().optional(),
  auth: z.object({
    storageState: z.string().optional(),
    login: z.object({
      url: z.string().min(1),
      usernameSelector: z.string().min(1).default('input[type="email"]'),
      passwordSelector: z.string().min(1).default('input[type="password"]'),
      submitSelector: z.string().min(1).default('button[type="submit"], input[type="submit"]'),
      usernameEnv: z.string().min(1).default("ROUTEPROOF_USERNAME"),
      passwordEnv: z.string().min(1).default("ROUTEPROOF_PASSWORD"),
      successUrl: z.string().min(1).optional(),
    }).optional(),
  }).optional(),
});

export const defaultConfig: RouteProofConfig = schema.parse({});

export async function loadConfig(configPath?: string): Promise<RouteProofConfig> {
  const candidate = resolve(configPath ?? "routeproof.config.ts");
  if (!existsSync(candidate)) return defaultConfig;

  const jiti = createJiti(import.meta.url, { interopDefault: true });
  const loaded = await jiti.import(candidate);
  const configModule = loaded as { default?: unknown };
  return schema.parse(configModule.default ?? configModule);
}

export function defineConfig(config: Partial<RouteProofConfig>): Partial<RouteProofConfig> {
  return config;
}

export function mergeConfig(
  fileConfig: RouteProofConfig,
  overrides: Partial<RouteProofConfig>,
): RouteProofConfig {
  return schema.parse({ ...fileConfig, ...overrides });
}
