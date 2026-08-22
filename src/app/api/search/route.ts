import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { searchChunks } from "@/lib/rag/search";
import { embeddingMode } from "@/lib/rag/embed";
import { parseDashboardSearch } from "@/lib/rag/dashboard-search";

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

/**
 * Dashboard search: same per-user rag.search pipeline the MCP client uses,
 * so you can see whether ingest worked without wiring Claude first.
 */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = parseDashboardSearch({
    q: req.nextUrl.searchParams.get("q"),
    topK: req.nextUrl.searchParams.get("topK"),
  });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const hits = await searchChunks({
      userId: user.id,
      query: parsed.query,
      topK: parsed.topK,
    });
    return NextResponse.json({
      embeddingMode: embeddingMode(),
      query: parsed.query,
      hits,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
