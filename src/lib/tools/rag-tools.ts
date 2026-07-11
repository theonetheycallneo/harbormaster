import { z } from "zod/v3";
import type { ToolRegistry } from "./registry";
import {
  searchChunks,
  listDocuments,
  getDocument,
} from "@/lib/rag/search";
import { ingestDocument } from "@/lib/rag/ingest";
import { embeddingMode } from "@/lib/rag/embed";

/**
 * The real tools: RAG over the authenticated user's document store.
 * These are also promoted to first-class MCP tools (see mcp.ts) — hot-path
 * tools get native schemas, the long tail goes through discovery.
 */
export function registerRagTools(registry: ToolRegistry) {
  registry.register({
    name: "rag.search",
    namespace: "rag",
    description:
      "Semantic search over the authenticated user's ingested documents. Returns the top matching chunks with document titles and cosine-similarity scores.",
    schema: {
      query: z.string().min(1).describe("Natural-language search query"),
      topK: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("Number of chunks to return (default 5)"),
    },
    simulated: false,
    handler: async (args, ctx) => {
      const hits = await searchChunks({
        userId: ctx.userId,
        query: String(args.query),
        topK: args.topK ? Number(args.topK) : undefined,
      });
      return { embeddingMode: embeddingMode(), hits };
    },
  });

  registry.register({
    name: "rag.list_documents",
    namespace: "rag",
    description:
      "List all documents in the authenticated user's store with chunk counts and sizes.",
    schema: {},
    simulated: false,
    handler: async (_args, ctx) => ({
      documents: await listDocuments(ctx.userId),
    }),
  });

  registry.register({
    name: "rag.get_document",
    namespace: "rag",
    description:
      "Fetch a full document by id, reassembled from its chunks in order.",
    schema: {
      documentId: z.string().uuid().describe("Document id from rag.list_documents"),
    },
    simulated: false,
    handler: async (args, ctx) => {
      const doc = await getDocument(ctx.userId, String(args.documentId));
      if (!doc) throw new Error(`Document not found: ${args.documentId}`);
      return doc;
    },
  });

  registry.register({
    name: "rag.ingest",
    namespace: "rag",
    description:
      "Ingest a new document into the authenticated user's store: chunked, embedded, and immediately searchable.",
    schema: {
      title: z.string().min(1).describe("Document title"),
      content: z.string().min(1).describe("Full document text (markdown or plain text)"),
    },
    simulated: false,
    handler: async (args, ctx) =>
      ingestDocument({
        userId: ctx.userId,
        title: String(args.title),
        content: String(args.content),
        source: "mcp",
      }),
  });
}
