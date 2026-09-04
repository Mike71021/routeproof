import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AuditResult, Finding } from "./types.js";

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function findingHtml(finding: Finding): string {
  return `<article class="finding ${finding.severity}">
    <div><span class="pill">${finding.code}</span><strong>${escapeHtml(finding.route)}</strong></div>
    <p>${escapeHtml(finding.message)}</p>
    ${finding.detail ? `<pre>${escapeHtml(finding.detail)}</pre>` : ""}
    ${finding.screenshot ? `<a href="${escapeHtml(finding.screenshot)}">View screenshot</a>` : ""}
  </article>`;
}

export function renderHtml(result: AuditResult): string {
  const routeRows = result.routes.map((route) => `<tr><td>${escapeHtml(route.route)}</td><td>${escapeHtml(route.discoveryMethod)}${route.discoveredFrom ? ` from ${escapeHtml(route.discoveredFrom)}` : ""}</td><td>${route.status ?? "—"}</td><td>${route.durationMs} ms</td><td>${route.links.length}</td><td>${route.networkFailures}</td><td>${route.pageErrors}</td></tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>RouteProof report</title><style>
  :root{font-family:Inter,ui-sans-serif,system-ui;color:#18201b;background:#f3f7f4}body{margin:0}main{max-width:1040px;margin:auto;padding:48px 24px}header{background:#163d2b;color:white;padding:32px;border-radius:20px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:24px 0}.stat,.finding,table{background:white;border:1px solid #dce6df;border-radius:14px}.stat{padding:18px}.stat b{display:block;font-size:28px}.finding{padding:18px;margin:12px 0}.finding.error{border-left:5px solid #d43b3b}.finding.warning{border-left:5px solid #e9a23b}.pill{font-size:11px;background:#e8efea;padding:4px 8px;border-radius:99px;margin-right:10px}pre{white-space:pre-wrap;background:#f5f5f5;padding:12px;border-radius:8px;overflow:auto}table{width:100%;border-collapse:collapse;overflow:hidden}th,td{text-align:left;padding:12px;border-bottom:1px solid #e6ece8}a{color:#12633d}@media(max-width:650px){.stats{grid-template-columns:1fr 1fr}}
  </style></head><body><main><header><h1>RouteProof</h1><p>${escapeHtml(result.baseUrl)}</p><small>${escapeHtml(result.finishedAt)}</small></header><section class="stats"><div class="stat"><b>${result.summary.scanned}</b>scanned</div><div class="stat"><b>${result.summary.healthy}</b>healthy</div><div class="stat"><b>${result.summary.errors}</b>errors</div><div class="stat"><b>${result.summary.warnings}</b>warnings</div></section><h2>Findings</h2>${result.findings.length ? result.findings.map(findingHtml).join("") : "<p>No problems found.</p>"}<h2>Routes</h2><table><thead><tr><th>Route</th><th>Discovered</th><th>Status</th><th>Duration</th><th>Links</th><th>API failures</th><th>JS errors</th></tr></thead><tbody>${routeRows}</tbody></table></main></body></html>`;
}

export async function writeReports(result: AuditResult, outputDir: string): Promise<void> {
  await mkdir(resolve(outputDir), { recursive: true });
  await Promise.all([
    writeFile(resolve(outputDir, "report.json"), `${JSON.stringify(result, null, 2)}\n`),
    writeFile(resolve(outputDir, "index.html"), renderHtml(result)),
  ]);
}
