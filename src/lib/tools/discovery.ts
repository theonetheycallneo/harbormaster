import { z } from "zod/v3";
import type { ToolRegistry, ToolContext } from "./registry";

export const DEFAULT_DISCOVERY_LIMIT = 10;
export const MAX_DISCOVERY_LIMIT = 25;
export const MAX_DISCOVERY_QUERY_CHARS = 2000;

export type ParsedDiscoveryAsk =
  | { ok: true; query: string; limit: number }
  | { ok: false; error: string };

export type SearchToolsResult = {
  total_registry_size: number;
  namespaces: { namespace: string; count: number }[];
  results: {
    name: string;
    description: string;
    simulated: boolean;
    relevance: number;
  }[];
  next_step: string;
};

export type DescribeToolResult = {
  name: string;
  namespace: string;
  description: string;
  simulated: boolean;
  arguments: Record<
    string,
    { description: string | null; optional: boolean }
  >;
};

export type DiscoveryOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type DiscoveryStepName =
  | "search_tools"
  | "describe_tool"
  | "invoke_tool";

export type DiscoveryStep = {
  tool: DiscoveryStepName;
  args: Record<string, unknown>;
  result: unknown;
  error?: string;
};

export type DiscoveryTrace = {
  query: string;
  picked: string | null;
  steps: DiscoveryStep[];
};

/**
 * Shared validation for the dashboard Discovery panel and POST /api/discover.
 */
export function parseDiscoveryAsk(input: {
  query?: string | null;
  limit?: number | string | null;
}): ParsedDiscoveryAsk {
  const query = (input.query ?? "").trim();
  if (!query) {
    return { ok: false, error: "Query is required" };
  }
  if (query.length > MAX_DISCOVERY_QUERY_CHARS) {
    return {
      ok: false,
      error: `Query is too long (${MAX_DISCOVERY_QUERY_CHARS} chars max)`,
    };
  }

  if (input.limit == null || input.limit === "") {
    return { ok: true, query, limit: DEFAULT_DISCOVERY_LIMIT };
  }

  const n = Number(input.limit);
  if (!Number.isInteger(n) || n < 1) {
    return {
      ok: false,
      error: `limit must be an integer from 1 to ${MAX_DISCOVERY_LIMIT}`,
    };
  }
  return { ok: true, query, limit: Math.min(n, MAX_DISCOVERY_LIMIT) };
}

const NEXT_STEP =
  "Call describe_tool for the argument schema, then invoke_tool to execute.";

/**
 * The same ranking the MCP `search_tools` meta-tool uses.
 */
export function searchTools(
  registry: ToolRegistry,
  query: string,
  limit = DEFAULT_DISCOVERY_LIMIT,
): SearchToolsResult {
  const results = registry.search(query, limit).map((t) => ({
    name: t.name,
    description: t.description,
    simulated: t.simulated,
    relevance: t.relevance,
  }));
  return {
    total_registry_size: registry.count(),
    namespaces: registry.namespaces(),
    results,
    next_step: NEXT_STEP,
  };
}

/**
 * The same schema dump the MCP `describe_tool` meta-tool uses.
 */
export function describeTool(
  registry: ToolRegistry,
  name: string,
): DiscoveryOutcome<DescribeToolResult> {
  const tool = registry.get(name);
  if (!tool) {
    return {
      ok: false,
      error: `Unknown tool '${name}'. Use search_tools to discover valid names.`,
    };
  }
  const argSpec = Object.fromEntries(
    Object.entries(tool.schema).map(([key, schema]) => [
      key,
      {
        description: schema.description ?? null,
        optional: schema.isOptional(),
      },
    ]),
  );
  return {
    ok: true,
    data: {
      name: tool.name,
      namespace: tool.namespace,
      description: tool.description,
      simulated: tool.simulated,
      arguments: argSpec,
    },
  };
}

/**
 * Validated dispatch — same path as MCP `invoke_tool`.
 */
export async function invokeTool(
  registry: ToolRegistry,
  name: string,
  args: Record<string, unknown> | undefined,
  ctx: ToolContext,
): Promise<DiscoveryOutcome<unknown>> {
  const tool = registry.get(name);
  if (!tool) {
    return {
      ok: false,
      error: `Unknown tool '${name}'. Use search_tools to discover valid names.`,
    };
  }
  const parsed = z.object(tool.schema).safeParse(args ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid arguments for ${tool.name}: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ")}`,
    };
  }
  try {
    return { ok: true, data: await tool.handler(parsed.data, ctx) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

/**
 * Fill invoke args from the operator's ask when the schema has a `query`
 * field (fleet tools and rag.search). Other required fields are left unset
 * so validation fails honestly instead of inventing values.
 */
export function invokeArgsFromAsk(
  registry: ToolRegistry,
  name: string,
  ask: string,
): Record<string, unknown> {
  const tool = registry.get(name);
  if (!tool) return {};
  if ("query" in tool.schema) {
    return { query: ask };
  }
  return {};
}

/**
 * The constant-context loop: search_tools → describe_tool → invoke_tool.
 * Picks the top-ranked registry hit; does not invent a tool that search
 * did not return.
 */
export async function runDiscoveryTrace(
  registry: ToolRegistry,
  input: { query: string; userId: string; limit?: number },
): Promise<DiscoveryTrace> {
  const limit = input.limit ?? DEFAULT_DISCOVERY_LIMIT;
  const search = searchTools(registry, input.query, limit);
  const steps: DiscoveryStep[] = [
    {
      tool: "search_tools",
      args: { query: input.query, limit },
      result: search,
    },
  ];

  const top = search.results[0];
  if (!top) {
    return { query: input.query, picked: null, steps };
  }

  const described = describeTool(registry, top.name);
  steps.push({
    tool: "describe_tool",
    args: { name: top.name },
    result: described.ok ? described.data : { error: described.error },
    error: described.ok ? undefined : described.error,
  });
  if (!described.ok) {
    return { query: input.query, picked: top.name, steps };
  }

  const invokeArgs = invokeArgsFromAsk(registry, top.name, input.query);
  const invoked = await invokeTool(registry, top.name, invokeArgs, {
    userId: input.userId,
  });
  steps.push({
    tool: "invoke_tool",
    args: { name: top.name, args: invokeArgs },
    result: invoked.ok ? invoked.data : { error: invoked.error },
    error: invoked.ok ? undefined : invoked.error,
  });

  return { query: input.query, picked: top.name, steps };
}
