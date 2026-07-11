import { defineMcpClientConnection } from "eve/connections";

/**
 * Harbormaster MCP gateway. The agent sees 7 tools (4 promoted rag_* tools +
 * 3 discovery meta-tools) regardless of how many tools the registry holds.
 *
 * HARBORMASTER_API_KEY is an `hm_...` key minted in the Harbormaster
 * dashboard; Eve sends it as `Authorization: Bearer` on every request and
 * the key never enters model context.
 */
export default defineMcpClientConnection({
  url: process.env.HARBORMASTER_URL ?? "http://localhost:3000/api/mcp/mcp",
  description:
    "Harbormaster: per-user document RAG plus a 116-tool fleet reached via search_tools/describe_tool/invoke_tool.",
  auth: {
    getToken: async () => ({ token: process.env.HARBORMASTER_API_KEY! }),
  },
});
