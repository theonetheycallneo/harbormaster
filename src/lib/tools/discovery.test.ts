import { describe, it, expect, beforeAll } from "vitest";
import { z } from "zod/v3";
import { getRegistry } from "./index";
import {
  parseDiscoveryAsk,
  searchTools,
  describeTool,
  invokeTool,
  invokeArgsFromAsk,
  runDiscoveryTrace,
  DEFAULT_DISCOVERY_LIMIT,
  MAX_DISCOVERY_LIMIT,
  MAX_DISCOVERY_QUERY_CHARS,
} from "./discovery";

beforeAll(() => {
  delete process.env.OPENAI_API_KEY;
});

describe("parseDiscoveryAsk", () => {
  it("requires a non-empty query", () => {
    expect(parseDiscoveryAsk({ query: "" })).toEqual({
      ok: false,
      error: "Query is required",
    });
    expect(parseDiscoveryAsk({ query: "   \n" })).toEqual({
      ok: false,
      error: "Query is required",
    });
    expect(parseDiscoveryAsk({})).toEqual({
      ok: false,
      error: "Query is required",
    });
  });

  it("trims the query and defaults limit", () => {
    expect(parseDiscoveryAsk({ query: "  refund a customer payment  " })).toEqual({
      ok: true,
      query: "refund a customer payment",
      limit: DEFAULT_DISCOVERY_LIMIT,
    });
  });

  it("parses and clamps limit", () => {
    expect(parseDiscoveryAsk({ query: "refunds", limit: 3 })).toEqual({
      ok: true,
      query: "refunds",
      limit: 3,
    });
    expect(parseDiscoveryAsk({ query: "refunds", limit: "99" })).toEqual({
      ok: true,
      query: "refunds",
      limit: MAX_DISCOVERY_LIMIT,
    });
    expect(parseDiscoveryAsk({ query: "refunds", limit: "" })).toEqual({
      ok: true,
      query: "refunds",
      limit: DEFAULT_DISCOVERY_LIMIT,
    });
  });

  it("rejects invalid limit values", () => {
    expect(parseDiscoveryAsk({ query: "x", limit: 0 }).ok).toBe(false);
    expect(parseDiscoveryAsk({ query: "x", limit: -1 }).ok).toBe(false);
    expect(parseDiscoveryAsk({ query: "x", limit: 1.5 }).ok).toBe(false);
    expect(parseDiscoveryAsk({ query: "x", limit: "nope" }).ok).toBe(false);
  });

  it("rejects oversized queries", () => {
    const result = parseDiscoveryAsk({
      query: "q".repeat(MAX_DISCOVERY_QUERY_CHARS + 1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too long/);
  });
});

describe("discovery path against the live registry", () => {
  const registry = getRegistry();

  it("search_tools ranks billing.issue_refund for a refund ask", () => {
    const found = searchTools(registry, "refund a customer payment");
    expect(found.total_registry_size).toBeGreaterThanOrEqual(100);
    expect(found.results[0]?.name).toBe("billing.issue_refund");
    expect(found.results[0]?.simulated).toBe(true);
    expect(found.results[0]?.relevance).toBeGreaterThan(0);
    expect(found.next_step).toMatch(/describe_tool/);
  });

  it("search_tools ranks crm.find_contact for a contact ask", () => {
    const found = searchTools(registry, "find a contact");
    expect(found.results[0]?.name).toBe("crm.find_contact");
  });

  it("search_tools returns empty results for garbage", () => {
    expect(searchTools(registry, "zzzzqqqq").results).toEqual([]);
  });

  it("describe_tool returns the live argument schema", () => {
    const described = describeTool(registry, "billing.issue_refund");
    expect(described.ok).toBe(true);
    if (!described.ok) return;
    expect(described.data.name).toBe("billing.issue_refund");
    expect(described.data.namespace).toBe("billing");
    expect(described.data.simulated).toBe(true);
    expect(described.data.arguments.query).toEqual({
      description: "Free-form input for this simulated tool",
      optional: true,
    });
  });

  it("describe_tool errors on unknown names", () => {
    const described = describeTool(registry, "not.a_tool");
    expect(described.ok).toBe(false);
    if (described.ok) return;
    expect(described.error).toMatch(/Unknown tool/);
  });

  it("invoke_tool dispatches a fleet tool with the session userId", async () => {
    const invoked = await invokeTool(
      registry,
      "billing.issue_refund",
      { query: "order 42" },
      { userId: "dashboard-user-1" },
    );
    expect(invoked.ok).toBe(true);
    if (!invoked.ok) return;
    const data = invoked.data as {
      simulated: boolean;
      tool: string;
      args: { query: string };
    };
    expect(data.simulated).toBe(true);
    expect(data.tool).toBe("billing.issue_refund");
    expect(data.args.query).toBe("order 42");
  });

  it("invoke_tool rejects invalid arguments at the schema boundary", async () => {
    const invoked = await invokeTool(
      registry,
      "rag.search",
      { topK: 5 },
      { userId: "dashboard-user-1" },
    );
    expect(invoked.ok).toBe(false);
    if (invoked.ok) return;
    expect(invoked.error).toMatch(/Invalid arguments for rag.search/);
  });

  it("invokeArgsFromAsk passes the ask as query when the schema has one", () => {
    expect(invokeArgsFromAsk(registry, "crm.find_contact", "find a contact")).toEqual({
      query: "find a contact",
    });
    expect(invokeArgsFromAsk(registry, "rag.list_documents", "list docs")).toEqual(
      {},
    );
  });

  it("runDiscoveryTrace walks search → describe → invoke for a refund ask", async () => {
    const trace = await runDiscoveryTrace(registry, {
      query: "refund a customer payment",
      userId: "dashboard-user-1",
    });

    expect(trace.query).toBe("refund a customer payment");
    expect(trace.picked).toBe("billing.issue_refund");
    expect(trace.steps.map((s) => s.tool)).toEqual([
      "search_tools",
      "describe_tool",
      "invoke_tool",
    ]);
    expect(trace.steps.every((s) => !s.error)).toBe(true);

    const search = trace.steps[0].result as { results: { name: string }[] };
    expect(search.results[0].name).toBe("billing.issue_refund");

    const described = trace.steps[1].result as { name: string; arguments: object };
    expect(described.name).toBe("billing.issue_refund");
    expect(described.arguments).toHaveProperty("query");

    const invoked = trace.steps[2].result as {
      simulated: boolean;
      tool: string;
    };
    expect(invoked.simulated).toBe(true);
    expect(invoked.tool).toBe("billing.issue_refund");
  });

  it("runDiscoveryTrace walks the loop for a contact ask", async () => {
    const trace = await runDiscoveryTrace(registry, {
      query: "find a contact",
      userId: "dashboard-user-1",
    });
    expect(trace.picked).toBe("crm.find_contact");
    expect(trace.steps).toHaveLength(3);
    const invoked = trace.steps[2].result as { tool: string };
    expect(invoked.tool).toBe("crm.find_contact");
  });

  it("runDiscoveryTrace does not invent describe/invoke when search is empty", async () => {
    const trace = await runDiscoveryTrace(registry, {
      query: "zzzzqqqq",
      userId: "dashboard-user-1",
    });
    expect(trace.picked).toBeNull();
    expect(trace.steps.map((s) => s.tool)).toEqual(["search_tools"]);
    const search = trace.steps[0].result as { results: unknown[] };
    expect(search.results).toEqual([]);
  });

  it("invoke_tool and describe_tool stay aligned with the registry schema", () => {
    const tool = registry.get("billing.issue_refund")!;
    const described = describeTool(registry, tool.name);
    expect(described.ok).toBe(true);
    if (!described.ok) return;
    const keys = Object.keys(described.data.arguments);
    expect(keys.sort()).toEqual(Object.keys(tool.schema).sort());
    const parsed = z.object(tool.schema).safeParse({ query: "order 42" });
    expect(parsed.success).toBe(true);
  });
});
