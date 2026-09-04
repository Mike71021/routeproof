import { describe, expect, it } from "vitest";
import { renderHtml } from "../src/report.js";

describe("HTML report", () => {
  it("escapes route and detail content", () => {
    const html = renderHtml({
      baseUrl: "https://example.com",
      startedAt: "2026-01-01",
      finishedAt: "2026-01-01",
      routes: [],
      findings: [{ code: "LOAD_ERROR", severity: "error", route: "/<script>", message: "Broken", detail: "<bad>" }],
      summary: { scanned: 0, healthy: 0, errors: 1, warnings: 0 },
    });
    expect(html).not.toContain("/<script>");
    expect(html).toContain("/&lt;script&gt;");
    expect(html).toContain("&lt;bad&gt;");
  });
});
