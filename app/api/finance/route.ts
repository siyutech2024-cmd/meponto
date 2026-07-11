import { acceptClientId, makeServerId, memory, jsonResponse } from "../../lib/server/memory";
import { flushPendingToDatabase } from "../../lib/server/persistence";
import { requirePermission } from "../../lib/server/authz";
import type { LedgerEntry } from "../../lib/data";

export function GET() {
  const totals = memory.ledgerEntries.reduce(
    (acc, entry) => {
      acc[entry.status] += entry.amount;
      return acc;
    },
    { Pending: 0, Approved: 0, Paid: 0, Rejected: 0 },
  );

  return jsonResponse({ data: memory.ledgerEntries, totals });
}

async function postImpl(request: Request) {
  const forbidden = requirePermission(request, "manage_rewards");
  if (forbidden) return forbidden;

  const body = (await request.json()) as Partial<LedgerEntry>;
  if (!body.recipient || !body.recipientType || !body.ledgerType || body.amount === undefined) {
    return jsonResponse({ error: "recipient, recipientType, ledgerType and amount are required" }, { status: 400 });
  }

  const id = acceptClientId(body.id) ?? makeServerId("led", memory.ledgerEntries.length + 1);
  const existing = memory.ledgerEntries.find((item) => item.id === id);
  if (existing) return jsonResponse({ data: existing });

  const entry: LedgerEntry = {
    id,
    recipient: body.recipient,
    recipientType: body.recipientType,
    ledgerType: body.ledgerType,
    amount: Number(body.amount),
    status: body.status ?? "Pending",
    notes: body.notes ?? "",
    createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
  };

  memory.ledgerEntries.unshift(entry);
  return jsonResponse({ data: entry }, { status: 201 });
}

// Serverless safety: flush mutations to the database BEFORE returning —
// the instance may freeze right after the response, losing a debounced flush.
export async function POST(...args: Parameters<typeof postImpl>) {
  const response = await postImpl(...args);
  await flushPendingToDatabase();
  return response;
}
