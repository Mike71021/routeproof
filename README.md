# RouteProof

[![CI](https://github.com/Mike71021/routeproof/actions/workflows/ci.yml/badge.svg)](https://github.com/Mike71021/routeproof/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/routeproof.svg)](https://www.npmjs.com/package/routeproof)

RouteProof audits the real navigation health of modern web applications. It crawls internal links in a real Chromium browser, checks direct page loads, surfaces browser errors, and generates a report made for humans and CI.

## Why RouteProof?

A client-side transition to `/account/settings` may work while refreshing that same URL returns a server 404. A page can exist in the router but be unreachable from the interface. Redirects and runtime errors also hide behind apparently healthy links. RouteProof checks these behaviors against a running application.

## Quick start

```bash
npx routeproof http://localhost:3000
```

Install Chromium the first time:

```bash
npx playwright install chromium
```

The command writes an interactive HTML report and a machine-readable JSON report to `routeproof-report/`. It exits with code `1` when errors are found.

Progress is printed as every route starts and finishes, including its HTTP status, duration, findings, and the number of routes waiting to be scanned.
At the end of the run, console and navigation error details are printed below each finding. Very long messages are shortened in the terminal and remain complete in the HTML and JSON reports.

## Configuration

Create `routeproof.config.ts`:

```ts
import { defineConfig } from "routeproof";

export default defineConfig({
  baseUrl: "http://localhost:3000",
  maxDepth: 4,
  maxRoutes: 200,
  timeoutMs: 15_000,
  delayMs: 250,
  exclude: ["/logout", "/api/*", "/^\\/preview\\//"],
  expectedRoutes: ["/", "/pricing", "/account/settings"],
  seedRoutes: ["/dashboard", "/account/settings"],
  sitemaps: ["/sitemap.xml"],
  screenshotOnError: true,
  consoleErrors: true,
  pageErrors: true,
  networkErrors: true,
  ignoreNetworkErrors: ["*google-analytics.com*"],
  soft404: {
    selectors: ["[data-testid='not-found']", ".not-found"],
    texts: ["Page not found", "404 Not Found"],
  },
});
```

Strings support `*` wildcards. A string surrounded by `/` is treated as a regular expression.

## Password-protected applications

RouteProof can sign in once and reuse the resulting cookies and local storage for the complete crawl:

```ts
import { defineConfig } from "routeproof";

export default defineConfig({
  baseUrl: "https://app.example.com",
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
  expectedRoutes: ["/dashboard", "/account/settings"],
});
```

Pass credentials through environment variables, never through committed configuration:

```bash
ROUTEPROOF_USERNAME="tester@example.com" \
ROUTEPROOF_PASSWORD="secret" \
npx routeproof
```

If an authenticated route redirects back to the configured login page, RouteProof reports an `AUTH_REDIRECT` error. Existing Playwright session files are also supported with `auth: { storageState: ".auth/user.json" }`; session files contain secrets and must be ignored by Git.

## CLI

```text
routeproof [url]

Options:
  -c, --config <path>       configuration file
  -o, --output <directory>  report directory
  --max-routes <number>     maximum number of routes
  --max-depth <number>      maximum crawl depth
  --timeout <milliseconds>  navigation timeout
  --delay <milliseconds>    delay between route scans
  --no-screenshots          disable screenshots
  --fail-on-warnings        fail CI when warnings are found
```

## Use in GitHub Actions

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 20
- run: npm ci
- run: npx playwright install --with-deps chromium
- run: npm run build
- run: npm start &
- run: npx wait-on http://localhost:3000
- run: npx routeproof http://localhost:3000
```

## Current checks

- HTTP and navigation failures
- failed `fetch` and XHR API requests
- uncaught JavaScript exceptions (`pageerror`)
- soft-404 pages returning HTTP 200
- direct route HTTP failures
- cross-origin redirects
- suspiciously long redirect chains
- browser console errors
- configured routes that cannot be discovered through internal links
- routes listed in `sitemap.xml`, including sitemap indexes

`seedRoutes` are opened and audited even when no link points to them. `expectedRoutes` remain a discoverability assertion: they warn when the UI does not expose a route. Network noise can be excluded with wildcard or regular-expression patterns in `ignoreNetworkErrors`.

RouteProof reads `/sitemap.xml` by default and follows same-origin sitemap indexes. Set `sitemaps: []` to disable sitemap discovery or provide custom locations. Every route result records `discoveryMethod` and `discoveredFrom`, so the HTML and JSON reports explain where a route came from.

When an API failure, console messages, and an uncaught JavaScript exception happen during the same page load, RouteProof reports one `RUNTIME_INCIDENT` containing all correlated evidence instead of counting each symptom as an independent problem. Correlation is temporal evidence, not proof that the network failure caused the JavaScript error.

Each route is loaded once. Earlier versions performed a redundant second direct load, which duplicated application traffic without proving client-navigation behavior. A future client-navigation check will compare a real link click against direct navigation instead.

Use `delayMs` or `--delay` for rate-limited APIs and sensitive preproduction environments. The pause happens between route scans, never before the first route:

```bash
routeproof https://preprod.example.com --delay 500
```

## Principles

- Read-only: RouteProof never submits forms or clicks destructive controls.
- Deterministic: reports are JSON and standalone HTML.
- Framework-independent: it tests the running application rather than router internals.
- CI-friendly: clear exit codes and bounded crawling.

## Development

```bash
npm install
npx playwright install chromium
npm run check
```

## Contributing

Bug reports and focused pull requests are welcome. Please add tests for new URL rules and checks. Security issues should follow [SECURITY.md](SECURITY.md).

## License

MIT
