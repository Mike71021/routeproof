import { describe, expect, it } from "vitest";
import { matchesAny, normalizeUrl, routeOf } from "../src/url.js";

describe("URLs", () => {
  it("normalizes internal URLs and removes hashes", () => {
    expect(normalizeUrl("/docs/?b=2&a=1#hello", "https://example.com"))
      .toBe("https://example.com/docs?a=1&b=2");
  });

  it("rejects external URLs", () => {
    expect(normalizeUrl("https://other.example/test", "https://example.com")).toBeNull();
  });

  it("extracts routes", () => {
    expect(routeOf("https://example.com/docs?q=one")).toBe("/docs?q=one");
  });

  it("supports globs and regex exclusions", () => {
    expect(matchesAny("/admin/users", ["/admin/*"])).toBe(true);
    expect(matchesAny("/product/42", ["/^\\/product\\/\\d+$/"])).toBe(true);
  });
});
