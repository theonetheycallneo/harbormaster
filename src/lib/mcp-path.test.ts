import { describe, expect, it } from "vitest";
import { LEGACY_MCP_PATH, MCP_PATH, withCanonicalMcpUrl } from "./mcp-path";

describe("withCanonicalMcpUrl", () => {
  it("leaves the canonical /api/mcp path unchanged", () => {
    const req = new Request("http://localhost:3000/api/mcp", {
      method: "POST",
      headers: { Authorization: "Bearer hm_test" },
      body: '{"jsonrpc":"2.0"}',
    });
    expect(withCanonicalMcpUrl(req)).toBe(req);
    expect(new URL(req.url).pathname).toBe(MCP_PATH);
  });

  it("rewrites /api/mcp/mcp to /api/mcp without dropping body or headers", () => {
    const req = new Request("http://localhost:3000/api/mcp/mcp?session=1", {
      method: "POST",
      headers: {
        Authorization: "Bearer hm_test",
        "Content-Type": "application/json",
      },
      body: '{"jsonrpc":"2.0","method":"initialize"}',
    });
    const rewritten = withCanonicalMcpUrl(req);
    const url = new URL(rewritten.url);
    expect(url.pathname).toBe(MCP_PATH);
    expect(url.pathname).not.toBe(LEGACY_MCP_PATH);
    expect(url.searchParams.get("session")).toBe("1");
    expect(rewritten.method).toBe("POST");
    expect(rewritten.headers.get("Authorization")).toBe("Bearer hm_test");
    expect(rewritten.headers.get("Content-Type")).toBe("application/json");
  });
});
