import { jsonResponse, memory } from "../../../lib/server/memory";
import { requirePermission } from "../../../lib/server/authz";
import type { LedgerEntry } from "../../../lib/data";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const forbidden = requirePermission(request, "view_finance");
  if (forbidden) return forbidden;

  const { id } = await params;
  const body = (await request.json()) as Partial<LedgerEntry>;
  const index = memory.ledgerEntries.findIndex((entry) => entry.id === id);
  if (index === -1) return jsonResponse({ error: "Ledger entry not found" }, { status: 404 });

  memory.ledgerEntries[index] = { ...memory.ledgerEntries[index], ...body };
  return jsonResponse({ data: memory.ledgerEntries[index] });
}
