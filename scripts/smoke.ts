/**
 * End-to-end smoke test against a running dev server:
 *   sign-up → API key → ingest via REST → MCP initialize → tools/list →
 *   rag_search → search_tools → invoke_tool (fleet).
 *
 * Run: npm run smoke   (expects `npm run dev` on :3000 and the db up)
 */

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const email = `smoke+${Date.now()}@harbormaster.local`;
const password = "smoke-test-password-1";

let failures = 0;

function ok(label: string, cond: boolean, detail?: unknown) {
  if (cond) {
    console.log(`  ✅ ${label}`);
  } else {
    failures++;
    console.error(`  ❌ ${label}`, detail ?? "");
  }
}

async function mcpCall(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/api/mcp/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: Math.random().toString(36).slice(2), ...body }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MCP ${body.method} → HTTP ${res.status}: ${text.slice(0, 300)}`);
  // Streamable HTTP may answer as SSE ("event: message\ndata: {...}") or plain JSON.
  const dataLine = text
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .pop();
  return JSON.parse(dataLine ? dataLine.slice(6) : text);
}

function firstText(result: Record<string, unknown>): string {
  const r = result.result as { content?: { type: string; text: string }[] } | undefined;
  return r?.content?.[0]?.text ?? "";
}

async function main() {
  console.log(`Smoke test against ${BASE}\n`);

  // 1. Sign up
  console.log("1. Auth");
  const signUp = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, password, name: "Smoke Test" }),
  });
  ok("sign-up succeeds", signUp.ok, await signUp.clone().text());
  const cookie = signUp.headers.get("set-cookie")?.split(";")[0] ?? "";
  ok("session cookie issued", cookie.length > 0);

  // 2. API key
  const keyRes = await fetch(`${BASE}/api/auth/api-key/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: BASE },
    body: JSON.stringify({ name: "smoke" }),
  });
  const keyJson = await keyRes.json();
  const apiKey: string = keyJson.key;
  ok("API key created", keyRes.ok && typeof apiKey === "string" && apiKey.length > 10, keyJson);

  // 3. Unauthenticated MCP is rejected
  console.log("\n2. MCP auth boundary");
  const noAuth = await fetch(`${BASE}/api/mcp/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  ok("request without key rejected (401)", noAuth.status === 401, noAuth.status);

  // 4. Ingest via REST
  console.log("\n3. RAG ingest + search");
  const doc = await fetch(`${BASE}/api/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      title: "Harbormaster Design Notes",
      content: [
        "Harbormaster is an authenticated MCP gateway with a per-user RAG store.",
        "The tool registry scales to hundreds of tools using progressive discovery: search_tools, describe_tool, and invoke_tool keep the model's context cost constant regardless of registry size.",
        "Embeddings use OpenAI text-embedding-3-small when a key is present, and fall back to a deterministic hashed bag-of-words baseline otherwise.",
        "The harbormaster manages hundreds of vessels the way this gateway manages hundreds of tools.",
      ].join("\n\n"),
    }),
  });
  const docJson = await doc.json();
  ok("document ingested", doc.status === 201 && docJson.chunkCount >= 1, docJson);

  // 5. MCP session
  const init = await mcpCall(apiKey, {
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "smoke", version: "0.0.1" },
    },
  });
  const serverName = (init.result as { serverInfo?: { name?: string } })?.serverInfo?.name;
  ok("MCP initialize", serverName === "harbormaster", init);

  const toolsList = await mcpCall(apiKey, { method: "tools/list", params: {} });
  const tools = ((toolsList.result as { tools?: { name: string }[] })?.tools ?? []).map(
    (t) => t.name,
  );
  ok(
    "tools/list exposes constant surface (7 tools)",
    tools.length === 7 &&
      ["rag_search", "search_tools", "describe_tool", "invoke_tool"].every((t) =>
        tools.includes(t),
      ),
    tools,
  );

  // 6. rag_search finds the ingested doc
  const search = await mcpCall(apiKey, {
    method: "tools/call",
    params: {
      name: "rag_search",
      arguments: { query: "progressive discovery constant context cost", topK: 3 },
    },
  });
  const searchPayload = JSON.parse(firstText(search) || "{}");
  ok(
    "rag_search returns the ingested chunk",
    Array.isArray(searchPayload.hits) &&
      searchPayload.hits.length > 0 &&
      searchPayload.hits[0].documentTitle === "Harbormaster Design Notes",
    searchPayload,
  );

  // 7. Discovery over the fleet
  console.log("\n4. Fleet orchestration via meta-tools");
  const discover = await mcpCall(apiKey, {
    method: "tools/call",
    params: { name: "search_tools", arguments: { query: "issue a refund to a customer" } },
  });
  const discovery = JSON.parse(firstText(discover) || "{}");
  const foundRefund = (discovery.results ?? []).some(
    (r: { name: string }) => r.name === "billing.issue_refund",
  );
  ok(
    `search_tools finds billing.issue_refund in a ${discovery.total_registry_size}-tool registry`,
    foundRefund,
    discovery.results?.slice(0, 3),
  );

  const invoke = await mcpCall(apiKey, {
    method: "tools/call",
    params: {
      name: "invoke_tool",
      arguments: { name: "billing.issue_refund", args: { query: "refund order 42" } },
    },
  });
  const invoked = JSON.parse(firstText(invoke) || "{}");
  ok(
    "invoke_tool dispatches to the fleet tool",
    invoked.simulated === true && invoked.tool === "billing.issue_refund",
    invoked,
  );

  console.log(
    failures === 0
      ? "\nAll smoke checks passed."
      : `\n${failures} smoke check(s) FAILED.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
