import { describe, it, expect } from "vitest";
import { z } from "zod/v3";
import { ToolRegistry, type RegisteredTool } from "./registry";

function makeTool(name: string, description: string): RegisteredTool {
  return {
    name,
    namespace: name.split(".")[0],
    description,
    schema: { query: z.string().optional() },
    simulated: true,
    handler: async (args) => ({ echoed: args }),
  };
}

describe("ToolRegistry", () => {
  it("registers and retrieves tools by name", () => {
    const r = new ToolRegistry();
    r.register(makeTool("billing.issue_refund", "Issue a refund to a customer"));
    expect(r.count()).toBe(1);
    expect(r.get("billing.issue_refund")?.namespace).toBe("billing");
    expect(r.get("nope")).toBeUndefined();
  });

  it("rejects duplicate names", () => {
    const r = new ToolRegistry();
    r.register(makeTool("crm.find_contact", "Find a contact"));
    expect(() => r.register(makeTool("crm.find_contact", "again"))).toThrow(
      /Duplicate/,
    );
  });

  it("groups namespaces with counts", () => {
    const r = new ToolRegistry();
    r.register(makeTool("crm.a", "x"));
    r.register(makeTool("crm.b", "x"));
    r.register(makeTool("billing.a", "x"));
    expect(r.namespaces()).toEqual([
      { namespace: "billing", count: 1 },
      { namespace: "crm", count: 2 },
    ]);
  });

  describe("search", () => {
    const r = new ToolRegistry();
    r.register(makeTool("billing.issue_refund", "Issue a full or partial refund to a customer payment"));
    r.register(makeTool("billing.list_invoices", "List invoices by status"));
    r.register(makeTool("support.escalate_ticket", "Escalate a support ticket about refunds"));
    r.register(makeTool("hr.get_employee", "Look up an employee profile"));

    it("ranks name matches above description matches", () => {
      const hits = r.search("refund");
      expect(hits[0].name).toBe("billing.issue_refund");
      expect(hits.map((h) => h.name)).toContain("support.escalate_ticket");
    });

    it("excludes non-matching tools", () => {
      const hits = r.search("refund");
      expect(hits.map((h) => h.name)).not.toContain("hr.get_employee");
    });

    it("respects the limit", () => {
      expect(r.search("billing refund invoice ticket", 2)).toHaveLength(2);
    });

    it("returns empty for garbage queries", () => {
      expect(r.search("")).toEqual([]);
      expect(r.search("!!")).toEqual([]);
      expect(r.search("zzzzqqqq")).toEqual([]);
    });

    it("is case-insensitive", () => {
      expect(r.search("REFUND")[0].name).toBe("billing.issue_refund");
    });
  });
});
