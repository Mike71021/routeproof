import { defineConfig } from "./src/index.js";

export default defineConfig({
  baseUrl: "http://localhost:3000",
  maxDepth: 4,
  maxRoutes: 200,
  delayMs: 250,
  observeMs: 1_000,
  exclude: ["/logout", "/api/*"],
  expectedRoutes: ["/", "/pricing", "/account/settings"],
  seedRoutes: ["/dashboard", "/account/settings"],
  sitemaps: ["/sitemap.xml"],
  networkErrors: true,
  pageErrors: true,
  ignoreNetworkErrors: ["*google-analytics.com*", "*/favicon.ico"],
  soft404: {
    selectors: ["[data-testid='not-found']", ".not-found"],
    texts: ["Page not found", "404 Not Found"],
  },
  outputDir: "routeproof-report",
  auth: {
    login: {
      url: "/login",
      usernameSelector: 'input[name="email"]',
      passwordSelector: 'input[name="password"]',
      submitSelector: 'button[type="submit"], input[type="submit"]',
      successUrl: "**/dashboard",
      usernameEnv: "ROUTEPROOF_USERNAME",
      passwordEnv: "ROUTEPROOF_PASSWORD",
    },
  },
});
