export const DEFAULT_TOP_K = 5;
export const MAX_TOP_K = 20;
export const MAX_QUERY_CHARS = 2000;

export type ParsedDashboardSearch =
  | { ok: true; query: string; topK: number }
  | { ok: false; error: string };

/**
 * Shared validation for the dashboard search box and GET /api/search.
 * Keeps the HTTP handler thin so the rules can be unit-tested without Postgres.
 */
export function parseDashboardSearch(input: {
  q?: string | null;
  topK?: string | null;
}): ParsedDashboardSearch {
  const query = (input.q ?? "").trim();
  if (!query) {
    return { ok: false, error: "Query is required" };
  }
  if (query.length > MAX_QUERY_CHARS) {
    return {
      ok: false,
      error: `Query is too long (${MAX_QUERY_CHARS} chars max)`,
    };
  }

  if (input.topK == null || input.topK === "") {
    return { ok: true, query, topK: DEFAULT_TOP_K };
  }

  const n = Number(input.topK);
  if (!Number.isInteger(n) || n < 1) {
    return { ok: false, error: `topK must be an integer from 1 to ${MAX_TOP_K}` };
  }
  return { ok: true, query, topK: Math.min(n, MAX_TOP_K) };
}

export function snippet(content: string, max = 220): string {
  const compact = content.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}…`;
}
