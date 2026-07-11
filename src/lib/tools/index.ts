import { ToolRegistry } from "./registry";
import { registerRagTools } from "./rag-tools";
import { registerFleet } from "./fleet";

/**
 * Build the full registry once per process. Next.js may re-evaluate modules
 * in dev; the globalThis cache keeps registration idempotent.
 */
const globalKey = Symbol.for("harbormaster.registry");

type GlobalWithRegistry = typeof globalThis & {
  [globalKey]?: ToolRegistry;
};

export function getRegistry(): ToolRegistry {
  const g = globalThis as GlobalWithRegistry;
  if (!g[globalKey]) {
    const registry = new ToolRegistry();
    registerRagTools(registry);
    registerFleet(registry);
    g[globalKey] = registry;
  }
  return g[globalKey];
}
