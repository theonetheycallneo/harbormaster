import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyApiKey = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      verifyApiKey: (...args: unknown[]) => verifyApiKey(...args),
    },
  },
}));

describe("POST /api/mcp", () => {
  beforeEach(() => {
    verifyApiKey.mockReset();
  });

  it("returns initialize from the canonical path with a valid Bearer key", async () => {
    verifyApiKey.mockResolvedValue({
      valid: true,
      key: { referenceId: "user-1" },
    });

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost:3000/api/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: "Bearer hm_test",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "verify", version: "0.0.1" },
          },
        }),
      }),
    );

    expect(res.status).toBe(200);
    const payload = await mcpResult(res);
    expect(payload.result?.serverInfo?.name).toBe("harbormaster");
  });

  it("rejects initialize without a Bearer key", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost:3000/api/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "verify", version: "0.0.1" },
          },
        }),
      }),
    );

    expect(res.status).toBe(401);
  });

  it("legacy /api/mcp/mcp alias still initializes", async () => {
    verifyApiKey.mockResolvedValue({
      valid: true,
      key: { referenceId: "user-1" },
    });

    const { POST } = await import("./[transport]/route");
    const res = await POST(
      new Request("http://localhost:3000/api/mcp/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: "Bearer hm_test",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "verify", version: "0.0.1" },
          },
        }),
      }),
    );

    expect(res.status).toBe(200);
    const payload = await mcpResult(res);
    expect(payload.result?.serverInfo?.name).toBe("harbormaster");
  });
});

async function mcpResult(res: Response): Promise<{
  result?: { serverInfo?: { name?: string } };
}> {
  const text = await res.text();
  const dataLine = text
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .pop();
  return JSON.parse(dataLine ? dataLine.slice(6) : text);
}
