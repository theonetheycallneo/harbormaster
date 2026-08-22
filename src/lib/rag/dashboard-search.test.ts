import { describe, it, expect } from "vitest";
import {
  parseDashboardSearch,
  snippet,
  DEFAULT_TOP_K,
  MAX_TOP_K,
  MAX_QUERY_CHARS,
} from "./dashboard-search";

describe("parseDashboardSearch", () => {
  it("requires a non-empty query", () => {
    expect(parseDashboardSearch({ q: "" })).toEqual({
      ok: false,
      error: "Query is required",
    });
    expect(parseDashboardSearch({ q: "   \n" })).toEqual({
      ok: false,
      error: "Query is required",
    });
    expect(parseDashboardSearch({})).toEqual({
      ok: false,
      error: "Query is required",
    });
  });

  it("trims the query and defaults topK", () => {
    expect(parseDashboardSearch({ q: "  rollback procedure  " })).toEqual({
      ok: true,
      query: "rollback procedure",
      topK: DEFAULT_TOP_K,
    });
  });

  it("parses and clamps topK", () => {
    expect(parseDashboardSearch({ q: "refunds", topK: "3" })).toEqual({
      ok: true,
      query: "refunds",
      topK: 3,
    });
    expect(parseDashboardSearch({ q: "refunds", topK: "99" })).toEqual({
      ok: true,
      query: "refunds",
      topK: MAX_TOP_K,
    });
    expect(parseDashboardSearch({ q: "refunds", topK: "" })).toEqual({
      ok: true,
      query: "refunds",
      topK: DEFAULT_TOP_K,
    });
  });

  it("rejects invalid topK values", () => {
    expect(parseDashboardSearch({ q: "x", topK: "0" }).ok).toBe(false);
    expect(parseDashboardSearch({ q: "x", topK: "-1" }).ok).toBe(false);
    expect(parseDashboardSearch({ q: "x", topK: "1.5" }).ok).toBe(false);
    expect(parseDashboardSearch({ q: "x", topK: "nope" }).ok).toBe(false);
  });

  it("rejects oversized queries", () => {
    const result = parseDashboardSearch({ q: "q".repeat(MAX_QUERY_CHARS + 1) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too long/);
  });
});

describe("snippet", () => {
  it("returns short text unchanged", () => {
    expect(snippet("hello world")).toBe("hello world");
  });

  it("collapses whitespace and truncates", () => {
    const text = "word ".repeat(80);
    const out = snippet(text, 40);
    expect(out.length).toBe(40);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/\s{2,}/);
  });
});
