import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => getSession(...args),
    },
  },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

describe("POST /api/discover", () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  it("rejects unauthenticated requests", async () => {
    getSession.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost:3000/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "refund a customer payment" }),
      }) as never,
    );
    expect(res.status).toBe(401);
  });

  it("rejects an empty ask", async () => {
    getSession.mockResolvedValue({ user: { id: "user-1" } });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost:3000/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "   " }),
      }) as never,
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/required/i);
  });

  it("runs the live search → describe → invoke loop with the session user", async () => {
    getSession.mockResolvedValue({ user: { id: "user-1" } });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost:3000/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "refund a customer payment" }),
      }) as never,
    );

    expect(res.status).toBe(200);
    const trace = await res.json();
    expect(trace.picked).toBe("billing.issue_refund");
    expect(trace.steps.map((s: { tool: string }) => s.tool)).toEqual([
      "search_tools",
      "describe_tool",
      "invoke_tool",
    ]);
    expect(trace.steps[2].result.tool).toBe("billing.issue_refund");
    expect(trace.steps[2].result.simulated).toBe(true);
  });
});
