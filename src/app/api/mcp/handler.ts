import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { auth } from "@/lib/auth";
import { withCanonicalMcpUrl } from "@/lib/mcp-path";
import { registerMcpSurface } from "@/lib/tools/mcp";

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

export function mcpHttpHandler(req: Request) {
  return authedHandler(withCanonicalMcpUrl(req));
}
