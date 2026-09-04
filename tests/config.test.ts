import { describe, expect, it } from "vitest";
import { defaultConfig, mergeConfig } from "../src/config.js";

describe("configuration", () => {
  it("accepts a non-negative crawl delay", () => {
    expect(mergeConfig(defaultConfig, { delayMs: 250 }).delayMs).toBe(250);
  });

  it("rejects a negative crawl delay", () => {
    expect(() => mergeConfig(defaultConfig, { delayMs: -1 })).toThrow();
  });
});
