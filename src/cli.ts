#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import { audit } from "./audit.js";
import { loadConfig, mergeConfig } from "./config.js";
import { writeReports } from "./report.js";
import { formatFindingDetail } from "./terminal.js";

const program = new Command();
program
  .name("routeproof")
  .description("Audit the navigation health of a web application")
  .argument("[url]", "Base URL to scan")
  .option("-c, --config <path>", "Configuration file")
  .option("-o, --output <directory>", "Report directory")
  .option("--max-routes <number>", "Maximum number of routes", Number)
  .option("--max-depth <number>", "Maximum crawl depth", Number)
  .option("--timeout <milliseconds>", "Navigation timeout", Number)
  .option("--delay <milliseconds>", "Delay between route scans", Number)
  .option("--no-screenshots", "Disable screenshots")
  .option("--fail-on-warnings", "Exit with code 1 when warnings are found")
  .action(async (url: string | undefined, options) => {
    try {
      const loaded = await loadConfig(options.config);
      const config = mergeConfig(loaded, {
        baseUrl: url ?? loaded.baseUrl,
        outputDir: options.output ?? loaded.outputDir,
        maxRoutes: options.maxRoutes ?? loaded.maxRoutes,
        maxDepth: options.maxDepth ?? loaded.maxDepth,
        timeoutMs: options.timeout ?? loaded.timeoutMs,
        delayMs: options.delay ?? loaded.delayMs,
        screenshotOnError: options.screenshots,
      });
      if (!config.baseUrl) program.error("Provide a URL or set baseUrl in routeproof.config.ts");

      console.log(pc.bold(`RouteProof scanning ${config.baseUrl}\n`));
      const result = await audit(config, {
        onProgress(progress) {
          if (progress.phase === "auth-start") {
            console.log(pc.dim(`→ Authenticating at ${progress.route}`));
            return;
          }
          if (progress.phase === "auth-complete") {
            console.log(`${pc.green("✓")} Authentication successful\n`);
            return;
          }
          if (progress.phase === "sitemap-start") {
            console.log(pc.dim(`→ Looking for sitemap routes`));
            return;
          }
          if (progress.phase === "sitemap-complete") {
            console.log(`${pc.green("✓")} ${progress.discovered} route(s) found in sitemap\n`);
            return;
          }
          if (progress.phase === "start") {
            const source = progress.discoveredFrom
              ? `${progress.discoveryMethod} from ${progress.discoveredFrom}`
              : progress.discoveryMethod;
            console.log(pc.dim(`→ Testing ${progress.route} [${source}] (${progress.scanned} scanned, ${progress.queued} queued)`));
            return;
          }

          const hasErrors = Boolean(progress.errors);
          const hasWarnings = Boolean(progress.warnings);
          const marker = hasErrors ? pc.red("✕") : hasWarnings ? pc.yellow("⚠") : pc.green("✓");
          const status = progress.status === null || progress.status === undefined ? "no response" : `HTTP ${progress.status}`;
          console.log(`${marker} [${progress.scanned}/${progress.maxRoutes} max] ${progress.route} — ${status} — ${progress.durationMs}ms · ${progress.queued} queued`);
        },
      });
      await writeReports(result, config.outputDir);
      console.log(`\n${pc.green(`${result.summary.healthy} healthy`)} · ${pc.red(`${result.summary.errors} errors`)} · ${pc.yellow(`${result.summary.warnings} warnings`)}`);
      for (const finding of result.findings) {
        const color = finding.severity === "error" ? pc.red : pc.yellow;
        console.log(color(`${finding.severity === "error" ? "✕" : "⚠"} ${finding.route} — ${finding.message}`));
        for (const line of formatFindingDetail(finding.detail)) {
          console.log(pc.dim(line));
        }
      }
      console.log(`\nReport: ${config.outputDir}/index.html`);
      if (result.summary.errors || (options.failOnWarnings && result.summary.warnings)) process.exitCode = 1;
    } catch (error) {
      console.error(pc.red(error instanceof Error ? error.message : String(error)));
      process.exitCode = 2;
    }
  });

await program.parseAsync();
