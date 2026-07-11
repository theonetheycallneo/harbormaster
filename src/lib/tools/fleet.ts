import { z } from "zod/v3";
import type { ToolRegistry } from "./registry";

/**
 * The fleet: ~140 simulated tools across 10 enterprise namespaces.
 *
 * These exist to demonstrate orchestration at scale — discovery, namespacing,
 * and dispatch over a large catalog — without wiring 10 real vendors into a
 * demo. Every response is clearly marked { simulated: true }. Replacing a
 * simulated handler with a real API call changes nothing about the MCP
 * surface: that is the point.
 */

interface FleetSpec {
  namespace: string;
  domain: string;
  actions: { verb: string; noun: string; detail: string }[];
}

const FLEET: FleetSpec[] = [
  {
    namespace: "crm",
    domain: "customer relationship management",
    actions: [
      { verb: "find", noun: "contact", detail: "search contacts by name, email, or company" },
      { verb: "create", noun: "contact", detail: "add a new contact record" },
      { verb: "update", noun: "contact", detail: "update fields on a contact record" },
      { verb: "find", noun: "company", detail: "search company accounts" },
      { verb: "list", noun: "deals", detail: "list open deals in the pipeline" },
      { verb: "update", noun: "deal_stage", detail: "move a deal to a new pipeline stage" },
      { verb: "log", noun: "activity", detail: "log a call, meeting, or note against a record" },
      { verb: "list", noun: "tasks", detail: "list follow-up tasks for a rep" },
      { verb: "assign", noun: "owner", detail: "reassign a record to a new owner" },
      { verb: "summarize", noun: "account_history", detail: "summarize all activity on an account" },
      { verb: "score", noun: "lead", detail: "compute a lead score from engagement signals" },
      { verb: "merge", noun: "duplicates", detail: "merge duplicate contact records" },
      { verb: "export", noun: "segment", detail: "export a filtered contact segment" },
      { verb: "track", noun: "email_engagement", detail: "get open/click stats for an outreach email" },
    ],
  },
  {
    namespace: "billing",
    domain: "billing and payments",
    actions: [
      { verb: "create", noun: "invoice", detail: "create a draft invoice for a customer" },
      { verb: "send", noun: "invoice", detail: "send a finalized invoice" },
      { verb: "void", noun: "invoice", detail: "void an open invoice" },
      { verb: "list", noun: "invoices", detail: "list invoices filtered by status or customer" },
      { verb: "get", noun: "payment_status", detail: "check payment status of an invoice" },
      { verb: "issue", noun: "refund", detail: "issue a full or partial refund" },
      { verb: "create", noun: "payment_link", detail: "create a shareable payment link" },
      { verb: "update", noun: "subscription", detail: "change a subscription plan or quantity" },
      { verb: "cancel", noun: "subscription", detail: "cancel a subscription at period end" },
      { verb: "list", noun: "overdue_accounts", detail: "list accounts with overdue balances" },
      { verb: "forecast", noun: "revenue", detail: "project revenue from current subscriptions" },
      { verb: "apply", noun: "credit", detail: "apply account credit to a customer" },
      { verb: "get", noun: "tax_summary", detail: "summarize collected tax by jurisdiction" },
      { verb: "retry", noun: "failed_payment", detail: "retry a failed payment with dunning rules" },
    ],
  },
  {
    namespace: "calendar",
    domain: "scheduling",
    actions: [
      { verb: "find", noun: "availability", detail: "find open slots across attendees" },
      { verb: "create", noun: "event", detail: "schedule a calendar event" },
      { verb: "update", noun: "event", detail: "move or edit an event" },
      { verb: "cancel", noun: "event", detail: "cancel an event and notify attendees" },
      { verb: "list", noun: "events", detail: "list events in a date range" },
      { verb: "block", noun: "focus_time", detail: "reserve focus blocks on a calendar" },
      { verb: "propose", noun: "meeting_times", detail: "propose times to external attendees" },
      { verb: "set", noun: "out_of_office", detail: "set an out-of-office window" },
      { verb: "resolve", noun: "conflicts", detail: "detect and resolve double-bookings" },
      { verb: "summarize", noun: "week", detail: "summarize meeting load for a week" },
    ],
  },
  {
    namespace: "github",
    domain: "source control",
    actions: [
      { verb: "list", noun: "pull_requests", detail: "list open PRs in a repository" },
      { verb: "get", noun: "pull_request", detail: "get PR details, diff stats, and review state" },
      { verb: "create", noun: "issue", detail: "open a new issue" },
      { verb: "comment", noun: "issue", detail: "comment on an issue or PR" },
      { verb: "assign", noun: "reviewer", detail: "request review on a PR" },
      { verb: "merge", noun: "pull_request", detail: "merge a PR that passes checks" },
      { verb: "get", noun: "ci_status", detail: "get check-run status for a commit" },
      { verb: "list", noun: "releases", detail: "list tagged releases" },
      { verb: "create", noun: "release", detail: "cut a release with generated notes" },
      { verb: "search", noun: "code", detail: "search code across repositories" },
      { verb: "get", noun: "blame", detail: "find who last touched a line range" },
      { verb: "list", noun: "stale_branches", detail: "list branches with no recent commits" },
    ],
  },
  {
    namespace: "slack",
    domain: "team messaging",
    actions: [
      { verb: "send", noun: "message", detail: "post a message to a channel" },
      { verb: "send", noun: "dm", detail: "send a direct message" },
      { verb: "read", noun: "channel", detail: "read recent messages in a channel" },
      { verb: "read", noun: "thread", detail: "read a full thread" },
      { verb: "search", noun: "messages", detail: "search message history" },
      { verb: "schedule", noun: "message", detail: "schedule a message for later" },
      { verb: "add", noun: "reaction", detail: "react to a message" },
      { verb: "create", noun: "channel", detail: "create a channel and invite members" },
      { verb: "set", noun: "reminder", detail: "set a reminder for a user" },
      { verb: "summarize", noun: "channel_activity", detail: "summarize a channel since a timestamp" },
    ],
  },
  {
    namespace: "analytics",
    domain: "product analytics",
    actions: [
      { verb: "run", noun: "query", detail: "run a saved analytics query" },
      { verb: "get", noun: "funnel", detail: "compute conversion through a funnel" },
      { verb: "get", noun: "retention", detail: "compute cohort retention curves" },
      { verb: "get", noun: "dau_mau", detail: "get active-user counts and stickiness" },
      { verb: "segment", noun: "users", detail: "build a user segment from properties and events" },
      { verb: "track", noun: "experiment", detail: "get live results for an A/B experiment" },
      { verb: "detect", noun: "anomalies", detail: "flag metric anomalies vs. forecast" },
      { verb: "export", noun: "report", detail: "export a dashboard as CSV" },
      { verb: "list", noun: "top_events", detail: "rank events by volume" },
      { verb: "attribute", noun: "conversion", detail: "attribute conversions across channels" },
    ],
  },
  {
    namespace: "inventory",
    domain: "inventory management",
    actions: [
      { verb: "get", noun: "stock_level", detail: "check on-hand quantity for a SKU" },
      { verb: "list", noun: "low_stock", detail: "list SKUs under reorder point" },
      { verb: "create", noun: "purchase_order", detail: "draft a PO to a supplier" },
      { verb: "receive", noun: "shipment", detail: "receive inbound stock against a PO" },
      { verb: "adjust", noun: "stock", detail: "record a manual stock adjustment" },
      { verb: "transfer", noun: "stock", detail: "move stock between locations" },
      { verb: "get", noun: "supplier_lead_time", detail: "get average lead time for a supplier" },
      { verb: "forecast", noun: "demand", detail: "forecast demand for a SKU" },
      { verb: "list", noun: "dead_stock", detail: "list SKUs with no movement in N days" },
      { verb: "audit", noun: "discrepancies", detail: "compare system counts to cycle counts" },
    ],
  },
  {
    namespace: "support",
    domain: "customer support",
    actions: [
      { verb: "list", noun: "tickets", detail: "list tickets by status, priority, or assignee" },
      { verb: "get", noun: "ticket", detail: "get full ticket thread and metadata" },
      { verb: "reply", noun: "ticket", detail: "post an agent reply" },
      { verb: "escalate", noun: "ticket", detail: "escalate to a higher tier with context" },
      { verb: "merge", noun: "tickets", detail: "merge duplicate tickets" },
      { verb: "tag", noun: "ticket", detail: "apply category tags" },
      { verb: "get", noun: "csat", detail: "get satisfaction scores for a period" },
      { verb: "suggest", noun: "macro", detail: "suggest a canned response for a ticket" },
      { verb: "summarize", noun: "ticket_thread", detail: "summarize a long ticket for handoff" },
      { verb: "detect", noun: "churn_risk", detail: "flag accounts with escalating ticket sentiment" },
    ],
  },
  {
    namespace: "hr",
    domain: "people operations",
    actions: [
      { verb: "get", noun: "employee", detail: "look up an employee profile" },
      { verb: "list", noun: "team", detail: "list direct reports for a manager" },
      { verb: "request", noun: "time_off", detail: "submit a PTO request" },
      { verb: "approve", noun: "time_off", detail: "approve or deny a PTO request" },
      { verb: "get", noun: "pto_balance", detail: "check remaining PTO balance" },
      { verb: "start", noun: "onboarding", detail: "kick off onboarding tasks for a new hire" },
      { verb: "list", noun: "open_roles", detail: "list open requisitions" },
      { verb: "schedule", noun: "review", detail: "schedule a performance review cycle" },
      { verb: "get", noun: "org_chart", detail: "get the reporting chain for an employee" },
      { verb: "log", noun: "training", detail: "record completed compliance training" },
    ],
  },
  {
    namespace: "devops",
    domain: "infrastructure operations",
    actions: [
      { verb: "get", noun: "service_health", detail: "get health status for a service" },
      { verb: "list", noun: "deployments", detail: "list recent deployments" },
      { verb: "rollback", noun: "deployment", detail: "roll a service back to a prior release" },
      { verb: "scale", noun: "service", detail: "change replica count for a service" },
      { verb: "get", noun: "error_rate", detail: "get error rate for a service over a window" },
      { verb: "tail", noun: "logs", detail: "fetch recent logs filtered by level" },
      { verb: "list", noun: "alerts", detail: "list firing alerts" },
      { verb: "silence", noun: "alert", detail: "silence an alert with a reason and TTL" },
      { verb: "run", noun: "healthcheck", detail: "run a synthetic check against an endpoint" },
      { verb: "get", noun: "cost_report", detail: "summarize infra spend by service" },
      { verb: "rotate", noun: "secret", detail: "rotate a credential and restart consumers" },
      { verb: "create", noun: "incident", detail: "open an incident with severity and summary" },
    ],
  },
];

// Deterministic pseudo-data so demo output is stable run to run.
function simulatedResult(tool: string, args: Record<string, unknown>) {
  return {
    simulated: true,
    tool,
    note: "Fleet-demo tool: deterministic simulated data. Swap the handler for a real API client — the MCP surface does not change.",
    args,
    result: {
      status: "ok",
      id: `${tool.replace(/\./g, "-")}-0001`,
      timestamp: "2026-01-01T00:00:00Z",
    },
  };
}

export function registerFleet(registry: ToolRegistry) {
  for (const spec of FLEET) {
    for (const action of spec.actions) {
      const name = `${spec.namespace}.${action.verb}_${action.noun}`;
      registry.register({
        name,
        namespace: spec.namespace,
        description: `[simulated] ${capitalize(action.verb)} ${action.noun.replace(/_/g, " ")} — ${action.detail}. Part of the ${spec.domain} namespace.`,
        schema: {
          query: z
            .string()
            .optional()
            .describe("Free-form input for this simulated tool"),
        },
        simulated: true,
        handler: async (args) => simulatedResult(name, args),
      });
    }
  }
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
