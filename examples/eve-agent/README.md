# Eve agent → Harbormaster

The consumer side of the gateway: a [Vercel Eve](https://vercel.com/eve) agent
connected to Harbormaster over MCP. Eve is filesystem-first — the interesting
parts are three small files:

- `agent/instructions.md` — teaches the agent the discovery pattern: don't
  guess tool names, `search_tools` → `describe_tool` → `invoke_tool`.
- `agent/connections/harbormaster.ts` — `defineMcpClientConnection` pointed at
  the gateway. Eve sends the `hm_` API key as a Bearer token on every request;
  the key never enters model context.
- `agent/agent.ts` — model selection.

## Run it

Requires Node.js >= 24.

```bash
# 1. Have Harbormaster running (repo root): docker compose up -d && npm run dev
# 2. Mint an API key in the Harbormaster dashboard
cp .env.example .env      # set HARBORMASTER_API_KEY + a model provider key
npm install
npm exec -- eve dev       # interactive REPL
```

Then try:

> *"What does my runbook say about rollbacks?"* — the agent calls `rag_search`
> and cites the document.
>
> *"Issue a refund for order 42."* — the agent discovers
> `billing.issue_refund` via `search_tools`, executes it through
> `invoke_tool`, and reports that the result is simulated.

The point of the demo: the agent's context holds **7 tool schemas**, but it
can reach all 116 registry tools. That ratio is the whole thesis of
Harbormaster.
