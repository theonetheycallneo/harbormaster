import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { auth } from "@/lib/auth";
import { registerMcpSurface } from "@/lib/tools/mcp";

const MCP_PATH = "/api/mcp";
const LEGACY_MCP_PATH = "/api/mcp/mcp";

const handler = createMcpHandler(
  (server) => {
    registerMcpSurface(server);
  },
  {
    serverInfo: {
      name: "harbormaster",
      version: "0.1.0",
    },
  },
  {
    // mcp-handler 1.x matches url.pathname === `${basePath}/mcp`.
    // The public endpoint is /api/mcp (not /api/mcp/mcp).
    basePath: "/api",
    maxDuration: 60,
    disableSse: true,
  },
);

/**
 * Every MCP request must carry a Harbormaster API key:
 *   Authorization: Bearer hm_xxx
 * Keys are minted per-user in the dashboard (BetterAuth api-key plugin,
 * hashed at rest) and resolve to the owning user, which scopes every RAG
 * tool to that user's documents.
 */
const authedHandler = withMcpAuth(
  handler,
  async (_req, bearerToken) => {
    if (!bearerToken) return undefined;
    const { valid, key } = await auth.api.verifyApiKey({
      body: { key: bearerToken },
    });
    if (!valid || !key) return undefined;
    // With the default user-scoped config, referenceId is the owning userId.
    return {
      token: bearerToken,
      clientId: key.referenceId,
      scopes: [],
      extra: { userId: key.referenceId },
    };
  },
  { required: true },
);

/**
 * mcp-handler 1.x does an exact pathname match. Rewrite the request URL
 * (not the body) so the old /api/mcp/mcp transport path still works.
 */
function withCanonicalMcpUrl(req: Request): Request {
  const url = new URL(req.url);
  if (url.pathname !== LEGACY_MCP_PATH) return req;
  url.pathname = MCP_PATH;
  const canonical = url.toString();
  return new Proxy(req, {
    get(target, prop, receiver) {
      if (prop === "url") return canonical;
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export function mcpHttpHandler(req: Request) {
  return authedHandler(withCanonicalMcpUrl(req));
}
