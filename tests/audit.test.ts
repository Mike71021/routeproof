import { createServer, type Server } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { audit } from "../src/audit.js";
import { defaultConfig } from "../src/config.js";

describe("browser audit", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer((request, response) => {
      if (request.url === "/sitemap.xml") {
        response.writeHead(200, { "content-type": "application/xml" });
        response.end(`<?xml version="1.0"?><urlset><url><loc>${baseUrl}/from-sitemap</loc></url></urlset>`);
        return;
      }
      if (request.url === "/login") {
        response.writeHead(200, { "content-type": "text/html" });
        response.end(`<input name="email"><input name="password" type="password"><button type="submit">Sign in</button>
          <script>document.querySelector('button').onclick=()=>{document.cookie='routeproof_auth=1; path=/';location.href='/dashboard'}</script>`);
        return;
      }
      if (request.url === "/dashboard") {
        response.writeHead(200, { "content-type": "text/html" });
        response.end('<h1>Dashboard</h1><a href="/private">Private</a>');
        return;
      }
      if (request.url === "/private") {
        if (!request.headers.cookie?.includes("routeproof_auth=1")) {
          response.writeHead(302, { location: "/login" });
          response.end();
          return;
        }
        response.writeHead(200, { "content-type": "text/html" });
        response.end("<h1>Private</h1>");
        return;
      }
      if (request.url === "/missing") {
        response.writeHead(404, { "content-type": "text/html" });
        response.end("<h1>Missing</h1>");
        return;
      }
      if (request.url === "/broken-console") {
        response.writeHead(200, { "content-type": "text/html" });
        response.end("<script>console.error('fixture failure')</script><h1>Broken console</h1>");
        return;
      }
      if (request.url === "/diagnostics") {
        response.writeHead(200, { "content-type": "text/html" });
        response.end("<script>fetch('/api-fail');setTimeout(()=>{throw new Error('uncaught fixture')},0)</script><h1>Diagnostics</h1>");
        return;
      }
      if (request.url === "/api-fail") {
        response.writeHead(503, { "content-type": "application/json" });
        response.end('{"error":"unavailable"}');
        return;
      }
      if (request.url === "/soft-missing") {
        response.writeHead(200, { "content-type": "text/html" });
        response.end('<main data-testid="not-found"><h1>Page not found</h1></main>');
        return;
      }
      if (request.url === "/late-error") {
        response.writeHead(200, { "content-type": "text/html" });
        response.end("<h1>Late error</h1><script>setTimeout(()=>console.error('late fixture error'),100)</script>");
        return;
      }
      response.writeHead(200, { "content-type": "text/html" });
      response.end('<a href="/healthy">Healthy</a><a href="/missing">Missing</a><a href="/broken-console">Console</a>');
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Fixture server failed to start");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("crawls routes and reports browser-visible failures", async () => {
    const progress: string[] = [];
    const result = await audit({
      ...defaultConfig,
      baseUrl,
      outputDir: await mkdtemp(join(tmpdir(), "routeproof-")),
      screenshotOnError: false,
      expectedRoutes: ["/private"],
      seedRoutes: ["/diagnostics", "/soft-missing", "/late-error"],
      observeMs: 200,
    }, {
      onProgress: (event) => progress.push(`${event.phase}:${event.route}`),
    });

    expect(result.routes.map((route) => route.route)).toEqual(
      expect.arrayContaining(["/", "/healthy", "/missing", "/broken-console", "/from-sitemap"]),
    );
    expect(result.routes).toContainEqual(expect.objectContaining({
      route: "/from-sitemap",
      discoveryMethod: "sitemap",
    }));
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "HTTP_ERROR", route: "/missing" }),
      expect.objectContaining({ code: "CONSOLE_ERROR", route: "/broken-console" }),
      expect.objectContaining({ code: "UNREACHABLE_ROUTE", route: "/private" }),
      expect.objectContaining({
        code: "RUNTIME_INCIDENT",
        route: "/diagnostics",
        message: expect.stringContaining("1 API failure(s), 1 uncaught error(s)"),
      }),
      expect.objectContaining({ code: "SOFT_404", route: "/soft-missing" }),
      expect.objectContaining({ code: "CONSOLE_ERROR", route: "/late-error", detail: "late fixture error" }),
    ]));
    expect(result.findings.filter((finding) => finding.route === "/diagnostics")).toHaveLength(1);
    expect(progress).toEqual(expect.arrayContaining([
      "start:/",
      "complete:/",
      "start:/missing",
      "complete:/missing",
    ]));
  }, 30_000);

  it("logs in once and reuses the authenticated browser context", async () => {
    process.env.ROUTEPROOF_TEST_USERNAME = "tester@example.com";
    process.env.ROUTEPROOF_TEST_PASSWORD = "secret";
    try {
      const progress: string[] = [];
      const result = await audit({
        ...defaultConfig,
        baseUrl: `${baseUrl}/dashboard`,
        outputDir: await mkdtemp(join(tmpdir(), "routeproof-auth-")),
        screenshotOnError: false,
        auth: {
          login: {
            url: "/login",
            usernameSelector: 'input[name="email"]',
            passwordSelector: 'input[name="password"]',
            submitSelector: 'button.missing-on-purpose',
            successUrl: "**/dashboard",
            usernameEnv: "ROUTEPROOF_TEST_USERNAME",
            passwordEnv: "ROUTEPROOF_TEST_PASSWORD",
          },
        },
      }, {
        onProgress: (event) => progress.push(event.phase),
      });

      expect(progress.slice(0, 2)).toEqual(["auth-start", "auth-complete"]);
      expect(result.routes).toEqual(expect.arrayContaining([
        expect.objectContaining({ route: "/dashboard", status: 200 }),
        expect.objectContaining({ route: "/private", status: 200 }),
      ]));
      expect(result.findings.some((finding) => finding.code === "AUTH_REDIRECT")).toBe(false);
    } finally {
      delete process.env.ROUTEPROOF_TEST_USERNAME;
      delete process.env.ROUTEPROOF_TEST_PASSWORD;
    }
  }, 30_000);
});
