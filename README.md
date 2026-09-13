# ⚓ Harbormaster

**An authenticated MCP gateway that ingests your documents and orchestrates hundreds of tools — at constant context cost.**

Connect Claude (or any MCP client) to one endpoint and get: per-user RAG over everything you've ingested, plus a 116-tool registry the model navigates through progressive discovery instead of schema-dumping. Built with Next.js, [BetterAuth](https://better-auth.com), Postgres + pgvector, and the [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).

```
┌──────────────┐   Bearer hm_xxx   ┌───────────────────────────────────────┐
│ Claude Code  │ ────────────────▶ │  /api/mcp  (Streamable HTTP)          │
│ claude.ai    │                   │                                       │
│ GPT / any    │                   │  BetterAuth API key → userId          │
│ MCP client   │                   │            │                          │
└──────────────┘                   │            ▼                          │
                                   │  ┌─────────────────────────────┐      │
                                   │  │ MCP surface (7 tools, fixed)│      │
                                   │  │                             │      │
                                   │  │  rag_search      ┌──────────┼──────┼──▶ pgvector
                                   │  │  rag_ingest      │ promoted │      │    (per-user chunks)
                                   │  │  rag_get_document│ hot path │      │
                                   │  │  rag_list_docs   └──────────┤      │
                                   │  │                             │      │
                                   │  │  search_tools   ┌───────────┼──────┼──▶ Tool Registry
                                   │  │  describe_tool  │ discovery │      │    116 tools
                                   │  │  invoke_tool    └───────────┤      │    10 namespaces
                                   │  └─────────────────────────────┘      │
                                   └───────────────────────────────────────┘
```

## The problem this demonstrates

MCP makes it trivial to hand a model tools. It does not make it cheap: every advertised tool schema is context the model pays for on **every** turn, whether it uses the tool or not. At 10 tools this is noise. At 300 tools it's tens of thousands of tokens of preamble — before the user has said anything.

Harbormaster's answer is an old systems idea applied to agents: **a constant-size interface over an unbounded catalog.**

- **Hot-path tools are promoted.** The four `rag_*` tools are first-class MCP tools with native schemas — the model sees them immediately because they're used constantly.
- **The long tail is discovered, not advertised.** The other 112 tools live in an in-process registry. The model reaches them in three steps: `search_tools("issue a refund")` → `describe_tool("billing.issue_refund")` → `invoke_tool(...)`, with arguments validated against the tool's zod schema at dispatch.
- **Registry size is free.** Adding the 301st tool costs the model zero additional context. The `tools/list` response is 7 entries whether the registry holds 116 tools or 10,000.

The fleet tools (crm, billing, calendar, github, slack, analytics, inventory, support, hr, devops) return clearly-marked simulated data — they exist to prove the orchestration pattern at scale. Swapping a simulated handler for a real API client changes nothing about the MCP surface. That is the point.

## What's real

- **Auth** — BetterAuth email/password sessions for the dashboard; per-user API keys (hashed at rest, shown once) gate every MCP request. Each key resolves to its owning user, and every RAG tool is scoped to that user's documents. No key, no tools: the gateway 401s.
- **RAG** — paragraph-aware chunking (~1200 chars, 150 overlap) → embeddings → pgvector with HNSW cosine index. Search, list, fetch, and ingest are all exposed over both REST (dashboard) and MCP (agents). The dashboard search box runs the same per-user pipeline as `rag_search`, so you can see whether ingest worked before wiring a client.
- **Dashboard Discovery** — the signed-in dashboard runs the same `search_tools` → `describe_tool` → `invoke_tool` loop against the live registry. The session is the identity, so you can watch a fleet hit without minting an API key.
- **Zero-key demo mode** — without `OPENAI_API_KEY`, embeddings fall back to a deterministic hashed bag-of-words baseline (FNV-1a token hashing into 1536 dims, tf-weighted, L2-normalized). That's real lexical retrieval, not random vectors — the entire stack runs end-to-end with no external API keys. Set one env var to switch to `text-embedding-3-small`.
- **Tests + retrieval eval** — `npm test` runs unit tests (chunking, embedding determinism/normalization, registry search ranking, catalog composition, schema-validated dispatch, dashboard search query parsing) plus a golden-set retrieval eval that runs the real chunk→embed→rank pipeline in memory and fails the build if recall@1 or recall@3 regress — currently 78% / 100% on the zero-key lexical baseline. `npm run smoke` exercises the whole story against a running server: sign-up → API key → ingest → MCP initialize → auth rejection → `rag_search` relevance → fleet discovery → dispatch. CI runs lint, typecheck, units, and the eval on every push.

## Quickstart

```bash
git clone https://github.com/theonetheycallneo/harbormaster
cd harbormaster
npm install
cp .env.example .env          # then set BETTER_AUTH_SECRET (openssl rand -base64 32)

docker compose up -d           # Postgres 17 + pgvector on :5442
npm run db:push                # create tables
npm run dev                    # http://localhost:3000
```

Sign up, ingest a document, create an API key — then verify everything:

```bash
npm run smoke
```

## Connect a client

**Claude Code**

```bash
claude mcp add --transport http harbormaster \
  http://localhost:3000/api/mcp \
  --header "Authorization: Bearer hm_YOUR_KEY"
```

Then try:

> *"Search my docs for the deployment checklist"* — hits `rag_search` directly.
>
> *"Find a tool that can issue a refund and run it for order 42"* — the model calls `search_tools`, finds `billing.issue_refund` in the registry, inspects it with `describe_tool`, and executes through `invoke_tool`.

**claude.ai / ChatGPT connectors** — both require a publicly reachable URL (deploy to Vercel or tunnel with `ngrok http 3000`) and currently favor OAuth for remote servers; see roadmap.

**Vercel Eve** — [`examples/eve-agent`](examples/eve-agent) is a complete [Eve](https://vercel.com/eve) agent wired to the gateway via `defineMcpClientConnection`, with instructions that teach the discovery loop. One agent, 7 schemas in context, 116 tools in reach.

## MCP surface

| Tool | Kind | What it does |
|---|---|---|
| `rag_search` | promoted | Semantic search over your ingested chunks (cosine similarity, top-k) |
| `rag_list_documents` | promoted | List your documents with chunk counts |
| `rag_get_document` | promoted | Reassemble a full document from ordered chunks |
| `rag_ingest` | promoted | Chunk + embed + store a new document (agents can write) |
| `search_tools` | meta | Rank registry tools against a natural-language need |
| `describe_tool` | meta | Full argument schema for any registry tool |
| `invoke_tool` | meta | Validated dispatch to any of the 116 registry tools |

## Design notes

- **Why promote some tools and not others?** Discovery costs a round-trip. Tools used in almost every session should be native; tools used in 1% of sessions should be found. The split is a knob, not a doctrine — `mcp.ts` makes it a one-line change.
- **Why lexical search over tool descriptions?** At 116 tools, keyword scoring wins on latency and debuggability. The registry's `search()` is deliberately swappable for embedding search when a catalog outgrows it — the interface doesn't change.
- **Per-user isolation is enforced at the query layer.** Every chunk row carries `userId`; every RAG query filters on it. An API key can never read another user's documents, including through `invoke_tool`.

## Roadmap

- OAuth for remote connectors (BetterAuth ships an MCP OAuth-provider plugin — claude.ai and ChatGPT custom connectors want this flow)
- Reranking stage, and a larger eval corpus scored against real embeddings
- Embedding-based tool discovery for 1,000+ tool registries
- File upload (PDF/DOCX extraction) alongside paste-to-ingest

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

MIT
