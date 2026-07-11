import { describe, it, expect } from "vitest";
import { chunkText } from "./chunk";

describe("chunkText", () => {
  it("returns a single chunk for short text", () => {
    const chunks = chunkText("Hello world.\n\nSecond paragraph.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain("Hello world.");
    expect(chunks[0]).toContain("Second paragraph.");
  });

  it("returns empty array for empty/whitespace input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  \n ")).toEqual([]);
  });

  it("packs paragraphs up to the target size, then splits", () => {
    const paragraph = "word ".repeat(60).trim(); // ~300 chars
    const text = Array(10).fill(paragraph).join("\n\n"); // ~3000 chars
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(1300); // target + slack
    }
  });

  it("hard-splits a single oversized paragraph with overlap", () => {
    const huge = "x".repeat(5000);
    const chunks = chunkText(huge);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.join("").length).toBeGreaterThanOrEqual(5000); // overlap duplicates
  });

  it("keeps every non-empty chunk", () => {
    const chunks = chunkText("a\n\n\n\nb\n\nc");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe("a\n\nb\n\nc");
  });

  it("is deterministic", () => {
    const text = "para one.\n\n" + "filler ".repeat(300) + "\n\npara three.";
    expect(chunkText(text)).toEqual(chunkText(text));
  });
});
