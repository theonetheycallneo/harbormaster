"use client";

import { useState } from "react";

type DiscoveryStep = {
  tool: "search_tools" | "describe_tool" | "invoke_tool";
  args: Record<string, unknown>;
  result: unknown;
  error?: string;
};

type DiscoveryTrace = {
  query: string;
  picked: string | null;
  steps: DiscoveryStep[];
};

const STEP_META: Record<
  DiscoveryStep["tool"],
  { label: string; hint: string }
> = {
  search_tools: {
    label: "search_tools",
    hint: "Rank the registry against the ask",
  },
  describe_tool: {
    label: "describe_tool",
    hint: "Pull the argument schema for the top hit",
  },
  invoke_tool: {
    label: "invoke_tool",
    hint: "Validated dispatch — simulated fleet is expected",
  },
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function DiscoveryPanel() {
  const [ask, setAsk] = useState("");
  const [running, setRunning] = useState(false);
  const [visible, setVisible] = useState<DiscoveryStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);
    setError(null);
    setVisible([]);
    setPicked(null);
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: ask }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Discovery failed");
        return;
      }
      const trace = data as DiscoveryTrace;
      setPicked(trace.picked);
      for (let i = 0; i < trace.steps.length; i++) {
        setVisible((prev) => [...prev, trace.steps[i]]);
        if (i < trace.steps.length - 1) {
          await sleep(380);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Discovery failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="mb-8 rounded-xl border border-zinc-800 p-5">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-zinc-400">
        Discovery
      </h2>
      <p className="mb-3 text-xs text-zinc-500">
        The constant-context loop against the live registry —{" "}
        <code>search_tools</code> → <code>describe_tool</code> →{" "}
        <code>invoke_tool</code>. Signed-in session is enough; no API key.
      </p>
      <form onSubmit={run} className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-amber-500"
          placeholder='e.g. "refund a customer payment" or "find a contact"'
          required
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
        />
        <button
          disabled={running}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
        >
          {running ? "Running…" : "Run"}
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-amber-400">{error}</p>}
      {picked && (
        <p className="mt-3 font-mono text-xs text-zinc-500">
          picked <span className="text-amber-400">{picked}</span>
        </p>
      )}
      {visible.length > 0 && (
        <ol className="mt-4 flex flex-col gap-3">
          {visible.map((step, idx) => (
            <DiscoveryStepCard key={`${step.tool}-${idx}`} step={step} index={idx} />
          ))}
          {running && visible.length < 3 && (
            <li className="rounded-lg border border-dashed border-zinc-800 px-3 py-2 font-mono text-xs text-zinc-600">
              waiting for next step…
            </li>
          )}
        </ol>
      )}
    </section>
  );
}

function DiscoveryStepCard({
  step,
  index,
}: {
  step: DiscoveryStep;
  index: number;
}) {
  const meta = STEP_META[step.tool];
  return (
    <li className="rounded-lg bg-zinc-900 px-3 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="font-mono text-sm text-amber-400">
          <span className="mr-2 text-zinc-600">{index + 1}.</span>
          {meta.label}
        </p>
        <span className="shrink-0 text-xs text-zinc-600">{meta.hint}</span>
      </div>
      <p className="mb-2 font-mono text-xs text-zinc-500">
        {formatArgs(step.tool, step.args)}
      </p>
      {step.error ? (
        <p className="text-xs text-amber-400">{step.error}</p>
      ) : (
        <StepBody step={step} />
      )}
    </li>
  );
}

function StepBody({ step }: { step: DiscoveryStep }) {
  if (step.tool === "search_tools") {
    const result = step.result as {
      total_registry_size?: number;
      namespaces?: { namespace: string }[];
      results?: {
        name: string;
        description: string;
        simulated: boolean;
        relevance: number;
      }[];
    };
    const hits = result.results ?? [];
    return (
      <div>
        <p className="mb-2 text-xs text-zinc-500">
          {result.total_registry_size ?? 0} tools ·{" "}
          {result.namespaces?.length ?? 0} namespaces · {hits.length} ranked
        </p>
        {hits.length === 0 ? (
          <p className="text-sm text-zinc-600">No registry hits for that ask.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {hits.slice(0, 5).map((hit, i) => (
              <li
                key={hit.name}
                className="flex items-baseline justify-between gap-3 text-xs"
              >
                <span className="min-w-0 truncate font-mono text-zinc-200">
                  {i + 1}. {hit.name}
                  {hit.simulated && (
                    <span className="ml-2 text-zinc-600">simulated</span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-zinc-600">
                  rel {hit.relevance}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (step.tool === "describe_tool") {
    const result = step.result as {
      name?: string;
      description?: string;
      arguments?: Record<string, { description: string | null; optional: boolean }>;
    };
    const entries = Object.entries(result.arguments ?? {});
    return (
      <div>
        <p className="mb-2 text-xs leading-relaxed text-zinc-400">
          {result.description}
        </p>
        {entries.length === 0 ? (
          <p className="font-mono text-xs text-zinc-600">no arguments</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {entries.map(([key, spec]) => (
              <li key={key} className="font-mono text-xs text-zinc-300">
                {key}
                <span className="ml-2 text-zinc-600">
                  {spec.optional ? "optional" : "required"}
                  {spec.description ? ` · ${spec.description}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-zinc-300">
      {JSON.stringify(step.result, null, 2)}
    </pre>
  );
}

function formatArgs(
  tool: DiscoveryStep["tool"],
  args: Record<string, unknown>,
): string {
  if (tool === "search_tools") {
    return `query: ${JSON.stringify(args.query)}`;
  }
  if (tool === "describe_tool") {
    return `name: ${String(args.name)}`;
  }
  return `name: ${String(args.name)}  args: ${JSON.stringify(args.args ?? {})}`;
}
