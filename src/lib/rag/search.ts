import { db } from "@/db";
import { chunks, documents } from "@/db/schema";
import { and, eq, sql, cosineDistance, desc, asc } from "drizzle-orm";
import { embedQuery } from "./embed";

export interface SearchHit {
  documentId: string;
  documentTitle: string;
  chunkIdx: number;
  content: string;
  /** Cosine similarity in [0, 1] — higher is closer. */
  score: number;
}

export async function searchChunks(opts: {
  userId: string;
  query: string;
  topK?: number;
}): Promise<SearchHit[]> {
  const topK = Math.min(opts.topK ?? 5, 20);
  const queryEmbedding = await embedQuery(opts.query);

  const similarity = sql<number>`1 - (${cosineDistance(
    chunks.embedding,
    queryEmbedding,
  )})`;

  const rows = await db
    .select({
      documentId: chunks.documentId,
      documentTitle: documents.title,
      chunkIdx: chunks.idx,
      content: chunks.content,
      score: similarity,
    })
    .from(chunks)
    .innerJoin(documents, eq(chunks.documentId, documents.id))
    .where(eq(chunks.userId, opts.userId))
    .orderBy((t) => desc(t.score))
    .limit(topK);

  return rows.map((r) => ({ ...r, score: Number(r.score) }));
}

export async function listDocuments(userId: string) {
  return db
    .select({
      id: documents.id,
      title: documents.title,
      source: documents.source,
      contentLength: documents.contentLength,
      chunkCount: documents.chunkCount,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(eq(documents.userId, userId))
    .orderBy(desc(documents.createdAt));
}

export async function getDocument(userId: string, documentId: string) {
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, userId)));
  if (!doc) return null;

  const parts = await db
    .select({ idx: chunks.idx, content: chunks.content })
    .from(chunks)
    .where(eq(chunks.documentId, documentId))
    .orderBy(asc(chunks.idx));

  return {
    id: doc.id,
    title: doc.title,
    source: doc.source,
    createdAt: doc.createdAt,
    chunkCount: doc.chunkCount,
    content: parts.map((p) => p.content).join("\n\n"),
  };
}

export async function deleteDocument(userId: string, documentId: string) {
  const result = await db
    .delete(documents)
    .where(and(eq(documents.id, documentId), eq(documents.userId, userId)))
    .returning({ id: documents.id });
  return result.length > 0;
}
