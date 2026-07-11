import type { z } from "zod/v3";

export interface ToolContext {
  userId: string;
}

export interface RegisteredTool {
  /** Fully-qualified name, e.g. "rag.search" or "crm.find_contact". */
  name: string;
  namespace: string;
  description: string;
  /** Zod shape for the tool's arguments. */
  schema: z.ZodRawShape;
  /** True for fleet-demo tools that return simulated data. */
  simulated: boolean;
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

/**
 * A flat, in-process registry designed for the "hundreds of tools" problem.
 *
 * The failure mode at scale is context, not compute: advertising 300 tool
 * schemas to a model burns tens of thousands of tokens before the first user
 * message. Harbormaster instead exposes a constant-size MCP surface —
 * search_tools / describe_tool / invoke_tool — and lets the model pull tool
 * definitions on demand. Registry size stops mattering to the context window.
 */
export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  register(tool: RegisteredTool) {
    if (this.tools.has(tool.name)) {
      throw new Error(`Duplicate tool name: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  count(): number {
    return this.tools.size;
  }

  namespaces(): { namespace: string; count: number }[] {
    const acc = new Map<string, number>();
    for (const t of this.tools.values()) {
      acc.set(t.namespace, (acc.get(t.namespace) ?? 0) + 1);
    }
    return [...acc.entries()]
      .map(([namespace, count]) => ({ namespace, count }))
      .sort((a, b) => a.namespace.localeCompare(b.namespace));
  }

  /**
   * Keyword search over name, namespace, and description.
   * Deliberately simple and dependency-free; swap in embeddings over tool
   * descriptions when the catalog outgrows lexical matching.
   */
  search(query: string, limit = 10): (RegisteredTool & { relevance: number })[] {
    const terms = query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1);
    if (terms.length === 0) return [];

    const scored: (RegisteredTool & { relevance: number })[] = [];
    for (const tool of this.tools.values()) {
      const name = tool.name.toLowerCase();
      const haystack = `${name} ${tool.description.toLowerCase()}`;
      let score = 0;
      for (const term of terms) {
        if (name.includes(term)) score += 3;
        else if (haystack.includes(term)) score += 1;
      }
      if (score > 0) scored.push({ ...tool, relevance: score });
    }
    return scored
      .sort((a, b) => b.relevance - a.relevance || a.name.localeCompare(b.name))
      .slice(0, limit);
  }
}
