import { mcpHttpHandler } from "../handler";

/**
 * Backward-compatible alias for /api/mcp/mcp.
 * The canonical Streamable HTTP endpoint is GET/POST/DELETE /api/mcp.
 */
export {
  mcpHttpHandler as GET,
  mcpHttpHandler as POST,
  mcpHttpHandler as DELETE,
};
