import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getRegistry } from "@/lib/tools";
import { embeddingMode } from "@/lib/rag/embed";
import { listDocuments } from "@/lib/rag/search";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) redirect("/sign-in");

  const registry = getRegistry();
  const [docs, keys] = await Promise.all([
    listDocuments(session.user.id),
    auth.api.listApiKeys({ headers: requestHeaders }),
  ]);

  return (
    <DashboardClient
      userName={session.user.name || session.user.email}
      toolCount={registry.count()}
      namespaceCount={registry.namespaces().length}
      embeddingMode={embeddingMode()}
      initialDocs={docs.map((d) => ({
        ...d,
        createdAt: d.createdAt.toISOString(),
      }))}
      initialKeys={keys.apiKeys.map((k) => ({
        id: k.id,
        name: k.name,
        start: k.start,
        createdAt: k.createdAt.toISOString(),
      }))}
    />
  );
}
