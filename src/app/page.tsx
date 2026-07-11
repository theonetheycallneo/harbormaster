import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getRegistry } from "@/lib/tools";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  const registry = getRegistry();
  const namespaces = registry.namespaces();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <div>
        <p className="mb-3 font-mono text-sm text-amber-500">⚓ harbormaster</p>
        <h1 className="text-4xl font-semibold tracking-tight">
          One authenticated MCP gateway.
          <br />
          <span className="text-zinc-400">
            {registry.count()} tools. Constant context cost.
          </span>
        </h1>
        <p className="mt-5 max-w-xl leading-relaxed text-zinc-400">
          Ingest documents into a per-user RAG store, then connect Claude or
          any MCP client through a single endpoint. Hot-path tools are
          first-class; the long tail of {registry.count() - 4} tools is reached
          through progressive discovery —{" "}
          <code className="text-zinc-300">search_tools</code> →{" "}
          <code className="text-zinc-300">describe_tool</code> →{" "}
          <code className="text-zinc-300">invoke_tool</code> — so the model
          never pays context for tools it isn&apos;t using.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 font-mono text-xs text-zinc-500">
        {namespaces.map((n) => (
          <span
            key={n.namespace}
            className="rounded-full border border-zinc-800 px-3 py-1"
          >
            {n.namespace} · {n.count}
          </span>
        ))}
      </div>

      <div className="flex gap-3">
        {session ? (
          <Link
            href="/dashboard"
            className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-medium text-zinc-950 hover:bg-amber-400"
          >
            Open dashboard
          </Link>
        ) : (
          <Link
            href="/sign-in"
            className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-medium text-zinc-950 hover:bg-amber-400"
          >
            Sign in
          </Link>
        )}
        <a
          href="https://github.com/theonetheycallneo/harbormaster"
          className="rounded-lg border border-zinc-700 px-5 py-2.5 text-sm text-zinc-300 hover:border-zinc-500"
        >
          README
        </a>
      </div>
    </main>
  );
}
