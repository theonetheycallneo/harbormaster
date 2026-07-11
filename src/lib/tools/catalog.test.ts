import { describe, it, expect, beforeAll } from "vitest";
import { z } from "zod/v3";
import { getRegistry } from "./index";

beforeAll(() => {
  // Ensure the registry builds in zero-key mode; no DB connection is made
  // at registration time (handlers connect lazily on invocation).
  delete process.env.OPENAI_API_KEY;
});

describe("assembled registry (rag + fleet)", () => {
  const registry = getRegistry();

  it("holds the full catalog", () => {
    expect(registry.count()).toBeGreaterThanOrEqual(100);
    expect(registry.namespaces().length).toBe(11); // rag + 10 fleet
  });

  it("contains all four real rag tools, not simulated", () => {
    for (const name of [
      "rag.search",
      "rag.list_documents",
      "rag.get_document",
      "rag.ingest",
    ]) {
      const tool = registry.get(name);
      expect(tool, name).toBeDefined();
      expect(tool!.simulated).toBe(false);
    }
  });

  it("marks every fleet tool as simulated with a labeled description", () => {
    for (const ns of registry.namespaces()) {
      if (ns.namespace === "rag") continue;
      const hits = registry.search(ns.namespace, 50);
      for (const t of hits.filter((h) => h.namespace === ns.namespace)) {
        expect(t.simulated).toBe(true);
        expect(t.description).toMatch(/^\[simulated\]/);
      }
    }
  });

  it("is idempotent — repeated getRegistry() returns the same instance", () => {
    expect(getRegistry()).toBe(registry);
    expect(getRegistry().count()).toBe(registry.count());
  });

  it("discovery → dispatch flow works end to end (fleet tool)", async () => {
    const [hit] = registry.search("issue a refund to a customer");
    expect(hit.name).toBe("billing.issue_refund");

    const tool = registry.get(hit.name)!;
    const parsed = z.object(tool.schema).safeParse({ query: "order 42" });
    expect(parsed.success).toBe(true);

    const result = (await tool.handler(parsed.data as Record<string, unknown>, {
      userId: "user-1",
    })) as { simulated: boolean; tool: string };
    expect(result.simulated).toBe(true);
    expect(result.tool).toBe("billing.issue_refund");
  });

  it("rejects invalid arguments at the schema boundary", () => {
    const tool = registry.get("rag.search")!;
    const bad = z.object(tool.schema).safeParse({ topK: 5 }); // missing query
    expect(bad.success).toBe(false);
    const good = z.object(tool.schema).safeParse({ query: "x", topK: 5 });
    expect(good.success).toBe(true);
  });
});
