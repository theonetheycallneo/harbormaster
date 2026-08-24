"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { snippet } from "@/lib/rag/dashboard-search";

interface Doc {
  id: string;
  title: string;
  source: string;
  contentLength: number;
  chunkCount: number;
  createdAt: string;
}

interface KeyInfo {
  id: string;
  name: string | null;
  start: string | null;
  createdAt: string;
}

interface SearchHit {
  documentId: string;
  documentTitle: string;
  chunkIdx: number;
  content: string;
  score: number;
}

export function DashboardClient(props: {
  userName: string;
  toolCount: number;
  namespaceCount: number;
  embeddingMode: string;
  initialDocs: Doc[];
  initialKeys: KeyInfo[];
}) {
  const router = useRouter();
  const [docs, setDocs] = useState<Doc[]>(props.initialDocs);
  const [keys, setKeys] = useState<KeyInfo[]>(props.initialKeys);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [keyName, setKeyName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchHits, setSearchHits] = useState<SearchHit[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const loadDocs = useCallback(async () => {
    const res = await fetch("/api/documents");
    if (res.ok) {
      const data = await res.json();
      setDocs(data.documents);
    }
  }, []);

  const loadKeys = useCallback(async () => {
    const { data } = await authClient.apiKey.list();
    if (data) setKeys(data.apiKeys as unknown as KeyInfo[]);
  }, []);

  async function ingest(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Ingest failed");
      } else {
        setMessage(`Ingested "${data.title}" as ${data.chunkCount} chunks`);
        setTitle("");
        setContent("");
        await loadDocs();
      }
    } finally {
      setBusy(false);
    }
  }

  async function removeDoc(id: string) {
    await fetch(`/api/documents?id=${id}`, { method: "DELETE" });
    await loadDocs();
  }

  async function searchDocs(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    setSearchError(null);
    try {
      const params = new URLSearchParams({ q: searchQuery });
      const res = await fetch(`/api/search?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setSearchHits(null);
        setSearchError(data.error ?? "Search failed");
      } else {
        setSearchHits(data.hits as SearchHit[]);
      }
    } catch (err) {
      setSearchHits(null);
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    const { data, error } = await authClient.apiKey.create({
      name: keyName || "mcp-client",
    });
    if (error) {
      setMessage(error.message ?? "Key creation failed");
      return;
    }
    if (data?.key) setFreshKey(data.key);
    setKeyName("");
    await loadKeys();
  }

  async function removeKey(id: string) {
    await authClient.apiKey.delete({ keyId: id });
    await loadKeys();
  }

  async function signOut() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  const mcpUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/mcp`
      : "http://localhost:3000/api/mcp";

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-10 flex items-center justify-between">
        <div>
          <p className="font-mono text-sm text-amber-500">⚓ harbormaster</p>
          <p className="mt-1 text-sm text-zinc-400">
            {props.userName} · {props.toolCount} tools /{" "}
            {props.namespaceCount} namespaces · embeddings:{" "}
            <span className="text-zinc-200">{props.embeddingMode}</span>
          </p>
        </div>
        <button
          onClick={signOut}
          className="text-sm text-zinc-500 hover:text-zinc-200"
        >
          Sign out
        </button>
      </header>

      {message && (
        <p className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-amber-400">
          {message}
        </p>
      )}

      <section className="mb-8 rounded-xl border border-zinc-800 p-5">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Search your documents
        </h2>
        <p className="mb-3 text-xs text-zinc-500">
          Same per-user <code>rag_search</code> pipeline Claude uses — no MCP
          client required to see if ingest worked.
        </p>
        <form onSubmit={searchDocs} className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-amber-500"
            placeholder="e.g. rollback procedure"
            required
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button
            disabled={searching}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </form>
        {searchError && (
          <p className="mt-3 text-sm text-amber-400">{searchError}</p>
        )}
        {searchHits && searchHits.length === 0 && (
          <p className="mt-3 text-sm text-zinc-600">
            No chunks matched. Ingest a document first, or try different words.
          </p>
        )}
        {searchHits && searchHits.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {searchHits.map((hit) => (
              <li
                key={`${hit.documentId}-${hit.chunkIdx}`}
                className="rounded-lg bg-zinc-900 px-3 py-2"
              >
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <p className="truncate text-sm">{hit.documentTitle}</p>
                  <span className="shrink-0 font-mono text-xs text-zinc-500">
                    {(hit.score * 100).toFixed(0)}% · chunk {hit.chunkIdx + 1}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-zinc-400">
                  {snippet(hit.content)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Ingest */}
        <section className="rounded-xl border border-zinc-800 p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Ingest a document
          </h2>
          <form onSubmit={ingest} className="flex flex-col gap-3">
            <input
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-amber-500"
              placeholder="Title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className="h-40 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs outline-none focus:border-amber-500"
              placeholder="Paste markdown or plain text…"
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <button
              disabled={busy}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
            >
              {busy ? "Chunking + embedding…" : "Ingest"}
            </button>
          </form>
        </section>

        {/* Documents */}
        <section className="rounded-xl border border-zinc-800 p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Documents ({docs.length})
          </h2>
          {docs.length === 0 ? (
            <p className="text-sm text-zinc-600">
              Nothing ingested yet. Everything you add is chunked, embedded,
              and searchable via <code>rag_search</code> over MCP.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {docs.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between rounded-lg bg-zinc-900 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{d.title}</p>
                    <p className="font-mono text-xs text-zinc-500">
                      {d.chunkCount} chunks · {(d.contentLength / 1000).toFixed(1)}k chars ·{" "}
                      {d.source}
                    </p>
                  </div>
                  <button
                    onClick={() => removeDoc(d.id)}
                    className="ml-3 shrink-0 text-xs text-zinc-600 hover:text-red-400"
                  >
                    delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* API keys */}
        <section className="rounded-xl border border-zinc-800 p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            MCP API keys
          </h2>
          <form onSubmit={createKey} className="mb-3 flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-amber-500"
              placeholder="Key name (e.g. claude-code)"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
            />
            <button className="rounded-lg border border-amber-500/50 px-3 py-2 text-sm text-amber-400 hover:bg-amber-500/10">
              Create
            </button>
          </form>
          {freshKey && (
            <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
              <p className="mb-1 text-xs text-amber-400">
                Copy now — shown once, stored hashed:
              </p>
              <code className="block break-all font-mono text-xs text-zinc-200">
                {freshKey}
              </code>
            </div>
          )}
          <ul className="flex flex-col gap-2">
            {keys.map((k) => (
              <li
                key={k.id}
                className="flex items-center justify-between rounded-lg bg-zinc-900 px-3 py-2"
              >
                <span className="font-mono text-xs text-zinc-400">
                  {k.name ?? "unnamed"} · {k.start ?? "hm_"}…
                </span>
                <button
                  onClick={() => removeKey(k.id)}
                  className="text-xs text-zinc-600 hover:text-red-400"
                >
                  revoke
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Connect */}
        <section className="rounded-xl border border-zinc-800 p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Connect a client
          </h2>
          <p className="mb-2 text-xs text-zinc-500">Claude Code:</p>
          <pre className="mb-3 overflow-x-auto rounded-lg bg-zinc-900 p-3 font-mono text-xs text-zinc-300">
            {`claude mcp add --transport http harbormaster \\
  ${mcpUrl} \\
  --header "Authorization: Bearer hm_YOUR_KEY"`}
          </pre>
          <p className="text-xs leading-relaxed text-zinc-500">
            Then ask Claude to <em>“search my docs for …”</em> (first-class{" "}
            <code>rag_search</code>) or <em>“find a tool that can issue a
            refund”</em> — it will discover{" "}
            <code>billing.issue_refund</code> via <code>search_tools</code> and
            execute it through <code>invoke_tool</code>.
          </p>
        </section>
      </div>
    </main>
  );
}
