import { describe, expect, it } from "vitest";
import { formatFindingDetail } from "../src/terminal.js";

describe("terminal finding details", () => {
  it("indents details for readable CLI output", () => {
    expect(formatFindingDetail("TypeError: failed\nat app.js:10")).toEqual([
      "    TypeError: failed",
      "    at app.js:10",
    ]);
  });

  it("keeps the terminal concise", () => {
    const lines = formatFindingDetail(Array.from({ length: 10 }, (_, index) => `line ${index}`).join("\n"));
    expect(lines).toHaveLength(7);
    expect(lines.at(-1)).toContain("full detail");
  });
});
