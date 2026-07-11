import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { ingestDocument } from "@/lib/rag/ingest";
import { listDocuments, deleteDocument } from "@/lib/rag/search";
import { embeddingMode } from "@/lib/rag/embed";

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    embeddingMode: embeddingMode(),
    documents: await listDocuments(user.id),
  });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!title || !content) {
    return NextResponse.json(
      { error: "Both 'title' and 'content' are required" },
      { status: 400 },
    );
  }
  if (content.length > 500_000) {
    return NextResponse.json(
      { error: "Document too large (500KB max for the demo)" },
      { status: 413 },
    );
  }

  try {
    const result = await ingestDocument({
      userId: user.id,
      title,
      content,
      source: "dashboard",
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ingest failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing 'id'" }, { status: 400 });

  const deleted = await deleteDocument(user.id, id);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
