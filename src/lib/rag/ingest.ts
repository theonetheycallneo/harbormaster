import { db } from "@/db";
import { documents, chunks } from "@/db/schema";
import { chunkText } from "./chunk";
import { embedTexts } from "./embed";

export async function ingestDocument(opts: {
  userId: string;
  title: string;
  content: string;
  source?: string;
}) {
  const pieces = chunkText(opts.content);
  if (pieces.length === 0) {
    throw new Error("Document is empty after chunking");
  }

  const embeddings = await embedTexts(pieces);

  const [doc] = await db
    .insert(documents)
    .values({
      userId: opts.userId,
      title: opts.title,
      source: opts.source ?? "paste",
      contentLength: opts.content.length,
      chunkCount: pieces.length,
    })
    .returning();

  await db.insert(chunks).values(
    pieces.map((content, idx) => ({
      documentId: doc.id,
      userId: opts.userId,
      idx,
      content,
      embedding: embeddings[idx],
    })),
  );

  return { documentId: doc.id, title: doc.title, chunkCount: pieces.length };
}
