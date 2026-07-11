"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result =
        mode === "sign-in"
          ? await authClient.signIn.email({ email, password })
          : await authClient.signUp.email({ email, password, name: name || email });
      if (result.error) {
        setError(result.error.message ?? "Authentication failed");
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <p className="mb-8 font-mono text-sm text-amber-500">⚓ harbormaster</p>
      <div className="mb-6 flex gap-4 text-sm">
        {(["sign-in", "sign-up"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={
              m === mode
                ? "border-b-2 border-amber-500 pb-1 font-medium text-zinc-100"
                : "pb-1 text-zinc-500 hover:text-zinc-300"
            }
          >
            {m === "sign-in" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        {mode === "sign-up" && (
          <input
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm outline-none focus:border-amber-500"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        <input
          className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm outline-none focus:border-amber-500"
          placeholder="Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm outline-none focus:border-amber-500"
          placeholder="Password (8+ characters)"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          disabled={busy}
          className="mt-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
        >
          {busy ? "Working…" : mode === "sign-in" ? "Sign in" : "Create account"}
        </button>
      </form>
    </main>
  );
}
