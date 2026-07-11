import { describe, it, expect, beforeAll } from "vitest";
import { chunkText } from "@/lib/rag/chunk";
import { embedTexts, embedQuery } from "@/lib/rag/embed";

/**
 * Retrieval eval: golden-set recall over the real chunk→embed→rank pipeline,
 * run fully in memory (no Postgres) so it executes in CI on every push.
 *
 * This is the gate the README promises: change chunking, embeddings, or
 * ranking and recall@k regressions fail the build. The corpus is small and
 * lexical by design — it must pass in zero-key hashed-BoW mode; with
 * OPENAI_API_KEY set, `npm run eval` exercises real embeddings instead.
 */

const CORPUS: { id: string; title: string; content: string }[] = [
  {
    id: "runbook",
    title: "Deployment Runbook",
    content:
      "Deployment checklist for the rides platform. Before launch verify API rate limits and warm the Redis cache.\n\nRollback procedure: repoint the load balancer to the previous target group and drain in-flight webhook deliveries before disabling the release.",
  },
  {
    id: "onboarding",
    title: "Engineer Onboarding",
    content:
      "New engineers get repository access on day one. Install Docker, clone the monorepo, and run the bootstrap script.\n\nYour mentor schedules a pairing session in the first week to walk through the codebase.",
  },
  {
    id: "billing-faq",
    title: "Billing FAQ",
    content:
      "Refunds are issued to the original payment method within five business days.\n\nSubscription downgrades take effect at the end of the current billing period. Contact support to dispute an invoice.",
  },
  {
    id: "security",
    title: "Security Policy",
    content:
      "API keys are hashed at rest and shown exactly once at creation.\n\nRotate credentials quarterly. Report suspected leaks to the security channel immediately and revoke the affected key.",
  },
  {
    id: "oncall",
    title: "On-call Handbook",
    content:
      "The on-call engineer acknowledges pages within five minutes.\n\nFor a sev-1 incident, open a war room, assign a scribe, and post status updates every thirty minutes until resolution.",
  },
  {
    id: "vacation",
    title: "PTO Policy",
    content:
      "Employees accrue vacation days monthly. Submit time-off requests two weeks in advance.\n\nUnused vacation carries over up to ten days into the next calendar year.",
  },
];

const GOLDEN: { query: string; expected: string }[] = [
  { query: "how do I roll back a bad deployment", expected: "runbook" },
  { query: "load balancer rollback procedure", expected: "runbook" },
  { query: "when will my refund arrive", expected: "billing-faq" },
  { query: "dispute an invoice charge", expected: "billing-faq" },
  { query: "rotate api keys credentials", expected: "security" },
  { query: "what to do when a key leaks", expected: "security" },
  { query: "sev-1 incident war room process", expected: "oncall" },
  { query: "first week for a new engineer", expected: "onboarding" },
  { query: "carry over unused vacation days", expected: "vacation" },
];

interface IndexedChunk {
  docId: string;
  embedding: number[];
}

const index: IndexedChunk[] = [];

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // pipeline vectors are L2-normalized
}

async function rank(query: string): Promise<string[]> {
  const q = await embedQuery(query);
  return [...index]
    .sort((a, b) => cosine(q, b.embedding) - cosine(q, a.embedding))
    .map((c) => c.docId);
}

function recallAtK(ranked: Map<string, string[]>, k: number): number {
  let hits = 0;
  for (const { query, expected } of GOLDEN) {
    const docs = ranked.get(query)!;
    // unique doc ids in rank order, truncated to k
    const topDocs = [...new Set(docs)].slice(0, k);
    if (topDocs.includes(expected)) hits++;
  }
  return hits / GOLDEN.length;
}

beforeAll(async () => {
  delete process.env.OPENAI_API_KEY; // CI runs the zero-key baseline
  for (const doc of CORPUS) {
    const pieces = chunkText(doc.content);
    const embeddings = await embedTexts(pieces);
    index.push(...embeddings.map((embedding) => ({ docId: doc.id, embedding })));
  }
});

describe("retrieval eval (golden set, in-memory)", () => {
  it("indexes the whole corpus", () => {
    expect(index.length).toBeGreaterThanOrEqual(CORPUS.length);
  });

  it("meets recall thresholds on the golden set", async () => {
    const ranked = new Map<string, string[]>();
    for (const g of GOLDEN) ranked.set(g.query, await rank(g.query));

    const r1 = recallAtK(ranked, 1);
    const r3 = recallAtK(ranked, 3);

    // Report so regressions are diagnosable from CI logs.
    console.log(
      `retrieval eval — recall@1: ${(r1 * 100).toFixed(0)}%, recall@3: ${(r3 * 100).toFixed(0)}% over ${GOLDEN.length} golden queries`,
    );

    expect(r1).toBeGreaterThanOrEqual(0.75); // baseline: lexical fallback
    expect(r3).toBeGreaterThanOrEqual(0.9);
  });

  it("never crosses documents on exact-phrase queries", async () => {
    const ranked = await rank("drain in-flight webhook deliveries");
    expect(ranked[0]).toBe("runbook");
  });
});
