import { describe, it, expect, beforeAll } from "vitest";
import { embedTexts, embedQuery, embeddingMode, DIMENSIONS } from "./embed";

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // vectors are L2-normalized
}

describe("hashed bag-of-words embeddings (zero-key fallback)", () => {
  beforeAll(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it("reports hashed-bow mode without an API key", () => {
    expect(embeddingMode()).toBe("hashed-bow");
  });

  it("produces vectors of the configured dimension", async () => {
    const [v] = await embedTexts(["hello world"]);
    expect(v).toHaveLength(DIMENSIONS);
  });

  it("is deterministic — same text, same vector", async () => {
    const a = await embedQuery("the rollback procedure for deployments");
    const b = await embedQuery("the rollback procedure for deployments");
    expect(a).toEqual(b);
  });

  it("L2-normalizes vectors", async () => {
    const [v] = await embedTexts(["one two three four five"]);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 6);
  });

  it("returns zero vector for text with no tokens", async () => {
    const [v] = await embedTexts(["!!! ??? ..."]);
    expect(v.every((x) => x === 0)).toBe(true);
  });

  it("ranks lexically-overlapping text above unrelated text", async () => {
    const query = await embedQuery("rollback the load balancer deployment");
    const [related, unrelated] = await embedTexts([
      "to rollback a deployment, repoint the load balancer",
      "the quarterly marketing newsletter ships on tuesday",
    ]);
    expect(cosine(query, related)).toBeGreaterThan(cosine(query, unrelated));
  });

  it("handles empty batch", async () => {
    expect(await embedTexts([])).toEqual([]);
  });
});
