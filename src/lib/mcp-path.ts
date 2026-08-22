export const MCP_PATH = "/api/mcp";
export const LEGACY_MCP_PATH = "/api/mcp/mcp";

/**
 * mcp-handler 1.x matches url.pathname exactly. Rewrite the request URL
 * (not the body) so the old /api/mcp/mcp transport path still works.
 */
export function withCanonicalMcpUrl(req: Request): Request {
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
