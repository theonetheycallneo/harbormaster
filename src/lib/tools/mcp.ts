import { z } from "zod/v3";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { getRegistry } from "./index";
import type { ToolContext } from "./registry";
import { describeTool, invokeTool, searchTools } from "./discovery";

/**
 * The MCP surface: a constant-size set of entry points over an arbitrarily
 * large registry.
 *
 *   - The four rag.* tools are promoted to first-class MCP tools: hot-path
 *     tools deserve native schemas the model sees immediately.
 *   - Everything else (the 100+ tool fleet) is reached through three
 *     meta-tools: search_tools → describe_tool → invoke_tool. Adding the
 *     301st tool to the registry costs the model zero additional context.
 */

function userIdFrom(authInfo: AuthInfo | undefined): string {
  const userId = authInfo?.extra?.userId;
  if (typeof userId !== "string" || !userId) {
    throw new Error("Unauthenticated MCP request: missing user identity");
  }
  return userId;
}

function asText(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function asError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

export function registerMcpSurface(server: McpServer) {
  const registry = getRegistry();

  // --- Promoted first-class tools (rag.*) --------------------------------
  for (const name of [
    "rag.search",
    "rag.list_documents",
    "rag.get_document",
    "rag.ingest",
  ]) {
    const tool = registry.get(name);
    if (!tool) continue;
    server.tool(
      tool.name.replace(/\./g, "_"),
      tool.description,
      tool.schema,
      async (args: Record<string, unknown>, extra) => {
        try {
          const ctx: ToolContext = { userId: userIdFrom(extra.authInfo) };
          return asText(await tool.handler(args, ctx));
        } catch (err) {
          return asError(err);
        }
      },
    );
  }

  // --- Meta-tools: discovery and dispatch over the whole registry --------
  server.tool(
    "search_tools",
    `Search the tool registry (${registry.count()} tools across ${registry.namespaces().length} namespaces). Returns matching tool names and descriptions ranked by relevance. Use this to discover capabilities before calling invoke_tool.`,
    {
      query: z.string().min(1).describe("What you want to do, e.g. 'refund a customer payment'"),
      limit: z.number().int().min(1).max(25).optional().describe("Max results (default 10)"),
    },
    async (args) => {
      const found = searchTools(
        registry,
        String(args.query),
        args.limit ? Number(args.limit) : 10,
      );
      return asText({
        ...found,
        results: found.results.map((t) => ({
          name: t.name,
          description: t.description,
          simulated: t.simulated,
        })),
      });
    },
  );

  server.tool(
    "describe_tool",
    "Get the full argument schema and metadata for a registry tool found via search_tools.",
    {
      name: z.string().min(1).describe("Fully-qualified tool name, e.g. 'billing.issue_refund'"),
    },
    async (args) => {
      const described = describeTool(registry, String(args.name));
      if (!described.ok) return asError(described.error);
      return asText(described.data);
    },
  );

  server.tool(
    "invoke_tool",
    "Execute any registry tool by fully-qualified name with a JSON object of arguments. Arguments are validated against the tool's schema before execution.",
    {
      name: z.string().min(1).describe("Fully-qualified tool name, e.g. 'crm.find_contact'"),
      args: z
        .record(z.unknown())
        .optional()
        .describe("Arguments object matching the tool's schema (see describe_tool)"),
    },
    async (input, extra) => {
      try {
        const ctx: ToolContext = { userId: userIdFrom(extra.authInfo) };
        const invoked = await invokeTool(
          registry,
          String(input.name),
          (input.args as Record<string, unknown> | undefined) ?? {},
          ctx,
        );
        if (!invoked.ok) return asError(invoked.error);
        return asText(invoked.data);
      } catch (err) {
        return asError(err);
      }
    },
  );
}
