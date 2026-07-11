import { embedMany } from "ai";
import { openai } from "@ai-sdk/openai";

export const DIMENSIONS = 1536;

export const embeddingMode = (): "openai" | "hashed-bow" =>
  process.env.OPENAI_API_KEY ? "openai" : "hashed-bow";

/**
 * Embed a batch of texts.
 *
 * With OPENAI_API_KEY set: text-embedding-3-small (1536 dims).
 *
 * Without a key: a deterministic hashed bag-of-words baseline — each token is
 * hashed into one of 1536 buckets, tf-weighted, L2-normalized. This is real
 * lexical retrieval (not random vectors): identical phrasing ranks first and
 * overlapping vocabulary still scores. It exists so the entire demo runs with
 * zero external API keys; swap in real embeddings with one env var.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (embeddingMode() === "openai") {
    const { embeddings } = await embedMany({
      model: openai.textEmbedding("text-embedding-3-small"),
      values: texts,
    });
    return embeddings;
  }
  return texts.map(hashedBagOfWords);
}

export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await embedTexts([text]);
  return v;
}

// FNV-1a — stable across runs, no dependencies.
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function hashedBagOfWords(text: string): number[] {
  const vec = new Array<number>(DIMENSIONS).fill(0);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);

  for (const token of tokens) {
    vec[fnv1a(token) % DIMENSIONS] += 1;
  }

  const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1;
  return vec.map((x) => x / norm);
}
