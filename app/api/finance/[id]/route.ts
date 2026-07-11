import { jsonResponse, memory } from "../../../lib/server/memory";
import { flushPendingToDatabase } from "../../../lib/server/persistence";
import { requirePermission } from "../../../lib/server/authz";
import type { LedgerEntry } from "../../../lib/data";

async function putImpl(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const forbidden = requirePermission(request, "view_finance");
  if (forbidden) return forbidden;

  const { id } = await params;
  const body = (await request.json()) as Partial<LedgerEntry>;
  const index = memory.ledgerEntries.findIndex((entry) => entry.id === id);
  if (index === -1) return jsonResponse({ error: "Ledger entry not found" }, { status: 404 });

  memory.ledgerEntries[index] = { ...memory.ledgerEntries[index], ...body };
  return jsonResponse({ data: memory.ledgerEntries[index] });
}

// Serverless safety: flush mutations to the database BEFORE returning —
// the instance may freeze right after the response, losing a debounced flush.
export async function PUT(...args: Parameters<typeof putImpl>) {
  const response = await putImpl(...args);
  await flushPendingToDatabase();
  return response;
}
