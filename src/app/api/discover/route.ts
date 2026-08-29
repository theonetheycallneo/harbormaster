import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getRegistry } from "@/lib/tools";
import { parseDiscoveryAsk, runDiscoveryTrace } from "@/lib/tools/discovery";

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

/**
 * Dashboard Discovery: same search_tools → describe_tool → invoke_tool
 * loop the MCP client runs, authorized by the signed-in session (no API key).
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    query?: unknown;
    limit?: unknown;
  } | null;

  const parsed = parseDiscoveryAsk({
    query: typeof body?.query === "string" ? body.query : null,
    limit:
      typeof body?.limit === "number" || typeof body?.limit === "string"
        ? body.limit
        : null,
  });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const trace = await runDiscoveryTrace(getRegistry(), {
      query: parsed.query,
      limit: parsed.limit,
      userId: user.id,
    });
    return NextResponse.json(trace);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Discovery failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
