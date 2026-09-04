import { describe, expect, it } from "vitest";
import { extractSitemapLocations } from "../src/sitemap.js";

describe("sitemap parsing", () => {
  it("extracts and decodes sitemap locations", () => {
    expect(extractSitemapLocations(`
      <urlset>
        <url><loc>https://example.com/one</loc></url>
        <url><loc>https://example.com/search?a=1&amp;b=2</loc></url>
      </urlset>
    `)).toEqual([
      "https://example.com/one",
      "https://example.com/search?a=1&b=2",
    ]);
  });
});
